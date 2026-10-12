import { describe, expect, spyOn, test } from "bun:test";
import { sha512Hex, timingSafeEqualHex } from "../src/lib/crypto";
import { ORDER_STATUSES, type OrderStatus } from "../src/db/schema/enums";
import { ENABLED_PAYMENTS, truncateName } from "../src/modules/payments/midtrans.service";
import { canAdvancePaymentStatus, isTransitionAllowed, resolveMidtransStatus } from "../src/modules/payments/payment-status.service";
import { verifyMidtransSignature, type MidtransSignaturePayload } from "../src/modules/payments/signature";
import { parseWebhookPayload } from "../src/modules/payments/webhook.routes";

// Unit test murni (tanpa database, tanpa HTTP) untuk logic pembayaran.

const KEY = "SB-Mid-server-unit-test-key";
const sign = (o: { order_id: string; status_code: string; gross_amount: string }, key = KEY) =>
  sha512Hex(`${o.order_id}${o.status_code}${o.gross_amount}${key}`);

const payload = (over: Partial<MidtransSignaturePayload> = {}): MidtransSignaturePayload => {
  const base = { order_id: "order-1", status_code: "200", gross_amount: "2516000.00" };
  return { ...base, signature_key: sign(base), ...over };
};

describe("verifyMidtransSignature", () => {
  test("signature yang dihitung dengan server key yang sama → true", () => {
    expect(verifyMidtransSignature(payload(), KEY)).toBe(true);
  });

  test("hex huruf besar tetap diterima (heksadesimal tidak peka huruf)", () => {
    expect(verifyMidtransSignature(payload({ signature_key: payload().signature_key.toUpperCase() }), KEY)).toBe(true);
  });

  test("setiap bagian yang dipalsukan membuat signature tidak cocok", () => {
    for (const tampered of [{ order_id: "order-2" }, { status_code: "201" }, { gross_amount: "1.00" }]) {
      expect(verifyMidtransSignature(payload(tampered), KEY)).toBe(false);
    }
  });

  test("gross_amount dibaca sebagai teks mentah: '2516000.00' dan '2516000' menghasilkan signature berbeda", () => {
    const sig = payload().signature_key;
    expect(verifyMidtransSignature(payload({ gross_amount: "2516000", signature_key: sig }), KEY)).toBe(false);
  });

  test("signature dari server key lain → false", () => {
    expect(verifyMidtransSignature(payload(), "kunci-lain")).toBe(false);
  });

  test("server key kosong → selalu false (kalau tidak, siapa pun bisa menghitung signature-nya), dan dicatat", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const unsigned = { order_id: "o", status_code: "200", gross_amount: "1.00" };
      expect(verifyMidtransSignature({ ...unsigned, signature_key: sign(unsigned, "") }, "")).toBe(false);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  test("input bukan hex atau panjang salah → false, tidak pernah melempar", () => {
    for (const bad of ["z".repeat(128), "a".repeat(127), "a".repeat(129), "", "  ", "0x" + "a".repeat(126), "é".repeat(128), "%".repeat(128)]) {
      expect(() => verifyMidtransSignature(payload({ signature_key: bad }), KEY)).not.toThrow();
      expect(verifyMidtransSignature(payload({ signature_key: bad }), KEY)).toBe(false);
    }
  });

  test("field kosong → false", () => {
    for (const field of ["order_id", "status_code", "gross_amount", "signature_key"] as const) {
      expect(verifyMidtransSignature(payload({ [field]: "" }), KEY)).toBe(false);
    }
  });
});

describe("timingSafeEqualHex", () => {
  test("sama, beda, panjang beda, bukan hex", () => {
    expect(timingSafeEqualHex("deadbeef", "deadbeef")).toBe(true);
    expect(timingSafeEqualHex("deadbeef", "deadbeee")).toBe(false);
    expect(timingSafeEqualHex("deadbeef", "dead")).toBe(false);
    expect(timingSafeEqualHex("zzzzzzzz", "zzzzzzzz")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(true);
  });
});

describe("parseWebhookPayload", () => {
  const valid = { order_id: "o", status_code: "200", gross_amount: "1.00", signature_key: "s", transaction_status: "settlement", transaction_id: "t" };

  test("payload valid: field opsional menjadi null, field tak dikenal dibawa", () => {
    expect(parseWebhookPayload({ ...valid, extra: 1 })).toMatchObject({ ...valid, fraud_status: null, payment_type: null, extra: 1 });
    expect(parseWebhookPayload({ ...valid, fraud_status: "accept", payment_type: "qris" })).toMatchObject({ fraud_status: "accept", payment_type: "qris" });
  });

  test("bukan objek → 400", () => {
    for (const body of [null, undefined, "teks", 42, true]) {
      expect(() => parseWebhookPayload(body)).toThrow(expect.objectContaining({ status: 400 }));
    }
  });

  test("tiap field wajib: hilang, bukan string, atau hanya spasi → 400", () => {
    for (const field of Object.keys(valid)) {
      for (const bad of [undefined, 123, null, "   ", ["x"], { a: 1 }]) {
        expect(() => parseWebhookPayload({ ...valid, [field]: bad })).toThrow(expect.objectContaining({ status: 400 }));
      }
    }
  });
});

describe("resolveMidtransStatus", () => {
  const cases: [string, string | null | undefined, OrderStatus | null, "commit" | "release" | "none"][] = [
    ["settlement", null, "paid", "commit"],
    ["capture", "accept", "paid", "commit"],
    ["capture", "challenge", null, "none"],
    ["capture", null, null, "none"],
    ["authorize", null, null, "none"],
    ["pending", null, null, "none"],
    ["deny", null, null, "none"], // user masih bisa mencoba metode lain di Snap
    ["expire", null, "expired", "release"],
    ["cancel", null, "cancelled", "release"],
    ["refund", null, "refunded", "none"],
    ["partial_refund", null, "refunded", "none"],
  ];

  for (const [status, fraud, target, stock] of cases) {
    test(`${status}${fraud ? `+${fraud}` : ""} → ${target ?? "tetap"}, stok ${stock}`, () => {
      expect(resolveMidtransStatus({ transaction_status: status, fraud_status: fraud })).toEqual({ targetStatus: target, stockAction: stock });
    });
  }

  test("status tidak dikenal → tidak mengubah apa pun, tapi dicatat", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(resolveMidtransStatus({ transaction_status: "status_baru" })).toEqual({ targetStatus: null, stockAction: "none" });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("status_baru");
    } finally {
      warn.mockRestore();
    }
  });

  test("hanya settlement/capture-accept yang membuat order paid, dan hanya itu yang meng-commit stok", () => {
    const statuses = ["settlement", "capture", "authorize", "pending", "deny", "expire", "cancel", "refund", "partial_refund", "failure"];
    for (const fraud of [null, "accept", "challenge", "deny"]) {
      for (const status of statuses) {
        const r = resolveMidtransStatus({ transaction_status: status, fraud_status: fraud });
        const paid = r.targetStatus === "paid";
        expect(paid).toBe(status === "settlement" || (status === "capture" && fraud === "accept"));
        expect(r.stockAction === "commit").toBe(paid);
      }
    }
  });
});

describe("isTransitionAllowed (seluruh matriks)", () => {
  const allowed = new Set(["awaiting_payment>paid", "awaiting_payment>expired", "awaiting_payment>cancelled", "paid>refunded"]);

  test("hanya empat transisi yang sah; sisanya ditolak", () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        expect(isTransitionAllowed(from, to)).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  test("order yang sudah paid tidak bisa menjadi expired/cancelled; yang expired tidak bisa menjadi paid lewat jalur ini", () => {
    expect(isTransitionAllowed("paid", "expired")).toBe(false);
    expect(isTransitionAllowed("paid", "cancelled")).toBe(false);
    expect(isTransitionAllowed("expired", "paid")).toBe(false);
    expect(isTransitionAllowed("draft", "paid")).toBe(false);
  });
});

describe("canAdvancePaymentStatus: status pembayaran hanya maju", () => {
  test("maju atau sama boleh", () => {
    expect(canAdvancePaymentStatus("pending", "settlement")).toBe(true);
    expect(canAdvancePaymentStatus("pending", "pending")).toBe(true);
    expect(canAdvancePaymentStatus("settlement", "refund")).toBe(true);
    expect(canAdvancePaymentStatus("expire", "settlement")).toBe(true); // uang yang masuk harus tercatat
  });

  test("mundur ditolak: notifikasi terlambat tidak menimpa status akhir", () => {
    expect(canAdvancePaymentStatus("settlement", "pending")).toBe(false);
    expect(canAdvancePaymentStatus("settlement", "expire")).toBe(false);
    expect(canAdvancePaymentStatus("settlement", "deny")).toBe(false);
    expect(canAdvancePaymentStatus("refund", "settlement")).toBe(false);
    expect(canAdvancePaymentStatus("capture", "pending")).toBe(false);
  });

  test("status tidak dikenal dianggap tengah-tengah: tidak menimpa yang final, boleh menimpa pending", () => {
    expect(canAdvancePaymentStatus("settlement", "status_baru")).toBe(false);
    expect(canAdvancePaymentStatus("pending", "status_baru")).toBe(true);
  });
});

describe("midtrans.service: pembantu", () => {
  test("truncateName: maksimal 50 karakter, yang pendek tidak diubah", () => {
    expect(truncateName("Kursi")).toBe("Kursi");
    expect(truncateName("x".repeat(50))).toHaveLength(50);
    expect(truncateName("x".repeat(51))).toHaveLength(50);
    expect(truncateName("")).toBe("");
  });

  test("setiap metode bayar punya tepat satu channel Midtrans", () => {
    expect(ENABLED_PAYMENTS).toEqual({ qris: ["other_qris"], va_bca: ["bca_va"], credit_card: ["credit_card"] });
  });
});
