import { describe, expect, test } from "bun:test";
import {
  type Address,
  addressFormSchema,
  emptyAddressForm,
  formFromAddress,
  toCreatePayload,
  toPatchPayload,
} from "../src/lib/addressSchema";

const valid = {
  label: "Rumah",
  recipient_name: "Budi Santoso",
  phone: "+62 812 3456 7890",
  full_address: "Jl. Kaliurang KM 5 No. 12",
  province: "DI Yogyakarta",
  city: "Sleman",
  kecamatan: "",
  kelurahan: "",
  postal_code: "",
  is_default: false,
};

const address: Address = {
  id: "5b1c0a52-9f0e-4d56-8a3c-2f7a1b9e4c10",
  label: "Rumah",
  recipient_name: "Budi Santoso",
  phone: "+62 812 3456 7890",
  full_address: "Jl. Kaliurang KM 5 No. 12",
  kelurahan: "Caturtunggal",
  kecamatan: "Depok",
  city: "Sleman",
  province: "DI Yogyakarta",
  postal_code: "55281",
  latitude: -7.7661,
  longitude: 110.3772,
  is_default: false,
};

const errorFields = (input: Record<string, unknown>) => {
  const result = addressFormSchema.safeParse({ ...valid, ...input });
  return result.success ? [] : result.error.issues.map((i) => String(i.path[0]));
};

describe("addressFormSchema (cermin aturan backend)", () => {
  test("isian lengkap yang valid diterima, dan teks di-trim", () => {
    const parsed = addressFormSchema.parse({ ...valid, recipient_name: "  Budi  ", city: " Sleman ", kecamatan: "  Depok " });
    expect(parsed).toMatchObject({ recipient_name: "Budi", city: "Sleman", kecamatan: "Depok" });
  });

  test("field wajib kosong atau hanya spasi ditolak, termasuk city (zona ongkir bergantung pada kota)", () => {
    for (const field of ["label", "recipient_name", "phone", "full_address", "province", "city"]) {
      for (const bad of ["", "   "]) {
        expect(errorFields({ [field]: bad }), `${field}=${JSON.stringify(bad)}`).toContain(field);
      }
    }
  });

  test("telepon: hanya angka, +, spasi, -; minimal 8 digit; 8–20 karakter", () => {
    for (const ok of ["081234567890", "+62 812-3456-7890", "12345678"]) expect(errorFields({ phone: ok }), ok).toEqual([]);
    for (const bad of ["0812abc7890", "--- +++ ---", "+62 81 23", "1234567", "081234567890123456789", "(021) 1234567"]) {
      expect(errorFields({ phone: bad }), bad).toContain("phone");
    }
  });

  test("kode pos opsional tapi harus tepat 5 digit bila diisi", () => {
    for (const ok of ["", "   ", "55281"]) expect(errorFields({ postal_code: ok }), JSON.stringify(ok)).toEqual([]);
    for (const bad of ["5528", "552811", "5528a", "55 281"]) expect(errorFields({ postal_code: bad }), bad).toContain("postal_code");
  });

  test("batas panjang", () => {
    expect(errorFields({ label: "x".repeat(40) })).toEqual([]);
    expect(errorFields({ label: "x".repeat(41) })).toContain("label");
    expect(errorFields({ recipient_name: "x".repeat(121) })).toContain("recipient_name");
    expect(errorFields({ full_address: "abcd" })).toContain("full_address");
    expect(errorFields({ full_address: "x".repeat(501) })).toContain("full_address");
    expect(errorFields({ city: "x".repeat(81) })).toContain("city");
    expect(errorFields({ kecamatan: "x".repeat(81), kelurahan: "x".repeat(81) }).sort()).toEqual(["kecamatan", "kelurahan"]);
  });
});

describe("toCreatePayload", () => {
  test("field opsional yang kosong tidak dikirim; is_default hanya dikirim bila true", () => {
    expect(toCreatePayload(valid)).toEqual({
      label: "Rumah",
      recipient_name: "Budi Santoso",
      phone: "+62 812 3456 7890",
      full_address: "Jl. Kaliurang KM 5 No. 12",
      province: "DI Yogyakarta",
      city: "Sleman",
    });
    expect(toCreatePayload({ ...valid, kecamatan: "Depok", postal_code: "55281", is_default: true })).toMatchObject({
      kecamatan: "Depok",
      postal_code: "55281",
      is_default: true,
    });
  });

  test("teks di-trim dan isian hanya spasi dianggap kosong", () => {
    const body = toCreatePayload({ ...valid, label: "  Kantor ", kecamatan: "   " });
    expect(body.label).toBe("Kantor");
    expect("kecamatan" in body).toBe(false);
  });
});

describe("toPatchPayload", () => {
  const unchanged = formFromAddress(address);

  test("tidak ada perubahan → body kosong (tidak perlu request)", () => {
    expect(toPatchPayload(unchanged, address)).toEqual({});
  });

  test("hanya field yang berubah yang dikirim", () => {
    expect(toPatchPayload({ ...unchanged, city: "Bantul", label: "Rumah Baru" }, address)).toEqual({
      city: "Bantul",
      label: "Rumah Baru",
    });
  });

  test("spasi di sekitar tidak dianggap perubahan", () => {
    expect(toPatchPayload({ ...unchanged, city: "  Sleman  " }, address)).toEqual({});
  });

  test("mengosongkan field opsional dikirim sebagai null; mengisi field yang tadinya kosong dikirim sebagai teks", () => {
    expect(toPatchPayload({ ...unchanged, kecamatan: "", postal_code: "   " }, address)).toEqual({
      kecamatan: null,
      postal_code: null,
    });
    const bare: Address = { ...address, kecamatan: null, kelurahan: null, postal_code: null };
    expect(toPatchPayload({ ...formFromAddress(bare), kecamatan: "Depok" }, bare)).toEqual({ kecamatan: "Depok" });
  });

  test("field opsional yang tadinya null dan tetap kosong tidak dikirim", () => {
    const bare: Address = { ...address, kecamatan: null, kelurahan: null, postal_code: null };
    expect(toPatchPayload(formFromAddress(bare), bare)).toEqual({});
  });

  test("is_default hanya dikirim saat berubah menjadi true; alamat utama tidak pernah mengirim false", () => {
    expect(toPatchPayload({ ...unchanged, is_default: true }, address)).toEqual({ is_default: true });

    const main: Address = { ...address, is_default: true };
    expect(toPatchPayload(formFromAddress(main), main)).toEqual({});
    expect(toPatchPayload({ ...formFromAddress(main), is_default: false }, main)).toEqual({}); // tidak ada "lepas utama"
  });

  test("tidak pernah menyertakan id, latitude, longitude", () => {
    const body = toPatchPayload({ ...unchanged, city: "Bantul" }, address);
    for (const key of ["id", "latitude", "longitude", "user_id"]) expect(key in body).toBe(false);
  });
});

describe("nilai awal form", () => {
  test("emptyAddressForm dan formFromAddress (null menjadi teks kosong)", () => {
    expect(emptyAddressForm()).toMatchObject({ label: "", city: "", is_default: false });
    expect(emptyAddressForm(true).is_default).toBe(true);
    const form = formFromAddress({ ...address, kecamatan: null, postal_code: null });
    expect(form).toMatchObject({ kecamatan: "", postal_code: "", city: "Sleman" });
  });
});
