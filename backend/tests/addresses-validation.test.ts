import { describe, expect, test } from "bun:test";
import { AppError } from "../src/lib/errors";
import { parseCreate, parsePatch } from "../src/modules/account/addresses.validation";

const base = {
  label: "Rumah",
  recipient_name: "Budi Santoso",
  phone: "+62 812 3456 7890",
  full_address: "Jl. Kaliurang KM 5 No. 12",
  province: "DI Yogyakarta",
  city: "Sleman",
};

function failure(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("seharusnya melempar AppError");
}

describe("parseCreate", () => {
  test("minimal: field opsional menjadi null, label kosong menjadi default 'Alamat'", () => {
    const { label: _omit, ...withoutLabel } = base;
    expect(parseCreate(withoutLabel)).toEqual({
      label: "Alamat",
      recipient_name: "Budi Santoso",
      phone: "+62 812 3456 7890",
      full_address: "Jl. Kaliurang KM 5 No. 12",
      province: "DI Yogyakarta",
      city: "Sleman",
      kecamatan: null,
      kelurahan: null,
      postal_code: null,
      latitude: null,
      longitude: null,
    });
  });

  test("semua teks di-trim; teks hanya spasi pada field opsional menjadi null", () => {
    const parsed = parseCreate({
      ...base,
      label: "  Kantor  ",
      recipient_name: "  Budi  ",
      city: "  Sleman ",
      kecamatan: "   ",
      kelurahan: "  Caturtunggal ",
      postal_code: "  55281 ",
    });
    expect(parsed).toMatchObject({ label: "Kantor", recipient_name: "Budi", city: "Sleman", kecamatan: null, kelurahan: "Caturtunggal", postal_code: "55281" });
  });

  test("batas panjang: tepat batas diterima, melebihi ditolak", () => {
    expect(() => parseCreate({ ...base, label: "x".repeat(40) })).not.toThrow();
    expect(() => parseCreate({ ...base, recipient_name: "x".repeat(120) })).not.toThrow();
    expect(() => parseCreate({ ...base, full_address: "x".repeat(500) })).not.toThrow();
    expect(() => parseCreate({ ...base, city: "x".repeat(80) })).not.toThrow();
    expect(() => parseCreate({ ...base, kecamatan: "x".repeat(80), kelurahan: "x".repeat(80) })).not.toThrow();

    for (const [field, length] of [["label", 41], ["recipient_name", 121], ["full_address", 501], ["city", 81], ["kecamatan", 81], ["kelurahan", 81]] as const) {
      expect(failure(() => parseCreate({ ...base, [field]: "x".repeat(length) })).message, field).toContain(`"${field}"`);
    }
    expect(failure(() => parseCreate({ ...base, full_address: "abcd" })).message).toContain('"full_address"');
  });

  test("field wajib: kosong, hanya spasi, hilang, atau bukan teks → 422 VALIDATION_FAILED dengan nama field", () => {
    for (const field of ["recipient_name", "phone", "full_address", "province", "city"]) {
      for (const bad of ["", "   ", undefined, null, 123]) {
        const error = failure(() => parseCreate({ ...base, [field]: bad }));
        expect(error.status, `${field}=${String(bad)}`).toBe(422);
        expect(error.code).toBe("VALIDATION_FAILED");
        expect(error.message).toContain(`"${field}"`);
      }
    }
  });

  test("city wajib (zona ongkir Jabodetabek bergantung pada nama kota)", () => {
    const { city: _omit, ...withoutCity } = base;
    expect(failure(() => parseCreate(withoutCity)).message).toContain('"city"');
  });

  test("telepon: hanya angka, +, spasi, -; minimal 8 DIGIT; 8–20 karakter", () => {
    for (const ok of ["081234567890", "+62 812-3456-7890", "12345678", "+62 8-1-2-3-4-5-6-7"]) {
      expect(() => parseCreate({ ...base, phone: ok }), ok).not.toThrow();
    }
    for (const bad of ["0812abc7890", "--- +++ ---", "+62 81 23", "1234567", "081234567890123456789", "(021) 1234567", "0812.3456.7890"]) {
      expect(failure(() => parseCreate({ ...base, phone: bad }), ).message, bad).toContain('"phone"');
    }
  });

  test("provinsi harus persis ada di PROVINCES: 'Jakarta' dan beda huruf ditolak, 'DKI Jakarta' diterima", () => {
    expect(() => parseCreate({ ...base, province: "DKI Jakarta", city: "Jakarta Selatan" })).not.toThrow();
    expect(() => parseCreate({ ...base, province: "Papua Barat Daya" })).not.toThrow();
    for (const bad of ["Jakarta", "dki jakarta", "Jawa", "DI  Yogyakarta", "Yogyakarta"]) {
      expect(failure(() => parseCreate({ ...base, province: bad })).message, bad).toContain('"province"');
    }
  });

  test("kode pos: tepat 5 digit", () => {
    expect(() => parseCreate({ ...base, postal_code: "55281" })).not.toThrow();
    for (const bad of ["5528", "552811", "5528a", "55 281", 55281]) {
      expect(failure(() => parseCreate({ ...base, postal_code: bad })).message, String(bad)).toContain('"postal_code"');
    }
  });

  test("koordinat: rentang, maksimal 7 desimal, dan harus berpasangan", () => {
    expect(parseCreate({ ...base, latitude: -7.7661, longitude: 110.3772 })).toMatchObject({ latitude: -7.7661, longitude: 110.3772 });
    expect(() => parseCreate({ ...base, latitude: 90, longitude: 180 })).not.toThrow();
    expect(() => parseCreate({ ...base, latitude: -90, longitude: -180 })).not.toThrow();
    expect(() => parseCreate({ ...base, latitude: 0.1234567, longitude: 0 })).not.toThrow(); // 7 desimal

    for (const [field, value] of [["latitude", 91], ["latitude", -90.1], ["longitude", 181], ["longitude", -180.5], ["latitude", NaN], ["latitude", Infinity], ["latitude", "1.5"], ["longitude", 0.12345678]] as const) {
      const pair = field === "latitude" ? { latitude: value, longitude: 0 } : { latitude: 0, longitude: value };
      expect(failure(() => parseCreate({ ...base, ...pair })).message, `${field}=${String(value)}`).toContain(`"${field}"`);
    }
    // berpasangan
    expect(failure(() => parseCreate({ ...base, longitude: 110 })).message).toContain('"latitude"');
    expect(failure(() => parseCreate({ ...base, latitude: -7 })).message).toContain('"longitude"');
    expect(parseCreate({ ...base, latitude: null, longitude: null })).toMatchObject({ latitude: null, longitude: null });
  });

  test("pesan error hanya menyebut NAMA field, tidak pernah mengulang isi (data pribadi)", () => {
    const error = failure(() => parseCreate({ ...base, phone: "0812-RAHASIA-xyz" }));
    expect(error.message).not.toContain("RAHASIA");
    expect(error.message).toBe('Data tidak valid pada field "phone".');
  });
});

describe("parsePatch", () => {
  test("hanya field yang DIKIRIM yang dikembalikan; field tak dikenal (id, user_id, created_at) diabaikan", () => {
    const patch = parsePatch({ city: "  Bantul ", id: "x", user_id: "y", created_at: "2020-01-01", is_default: true, foo: 1 });
    expect(patch).toEqual({ city: "Bantul" });
  });

  test("body tanpa field yang dikenal → objek kosong (route yang menolaknya)", () => {
    expect(parsePatch({})).toEqual({});
    expect(parsePatch({ foo: "bar" })).toEqual({});
  });

  test("null mengosongkan field opsional, tapi ditolak untuk field wajib", () => {
    expect(parsePatch({ kecamatan: null, kelurahan: null, postal_code: null, latitude: null, longitude: null })).toEqual({
      kecamatan: null,
      kelurahan: null,
      postal_code: null,
      latitude: null,
      longitude: null,
    });
    for (const field of ["recipient_name", "phone", "full_address", "province", "city", "label"]) {
      expect(failure(() => parsePatch({ [field]: null })).message, field).toContain(`"${field}"`);
    }
  });

  test("setiap field divalidasi dengan aturan yang sama seperti POST", () => {
    expect(failure(() => parsePatch({ province: "Jakarta" })).message).toContain('"province"');
    expect(failure(() => parsePatch({ phone: "abc" })).message).toContain('"phone"');
    expect(failure(() => parsePatch({ city: "   " })).message).toContain('"city"');
    expect(failure(() => parsePatch({ postal_code: "123" })).message).toContain('"postal_code"');
    expect(failure(() => parsePatch({ latitude: 95 })).message).toContain('"latitude"');
    expect(failure(() => parsePatch({ label: "x".repeat(41) })).message).toContain('"label"');
    expect(parsePatch({ province: "Bali", phone: "081234567890", latitude: -8.4, longitude: 115.1 })).toEqual({
      province: "Bali",
      phone: "081234567890",
      latitude: -8.4,
      longitude: 115.1,
    });
  });

  test("tipe salah untuk field opsional ditolak, bukan diam-diam dijadikan null", () => {
    expect(failure(() => parsePatch({ kecamatan: 5 })).message).toContain('"kecamatan"');
    expect(failure(() => parsePatch({ postal_code: 55281 })).message).toContain('"postal_code"');
    expect(failure(() => parsePatch({ latitude: "1" })).message).toContain('"latitude"');
  });
});
