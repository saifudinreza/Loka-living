import { Elysia, t } from "elysia";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../auth/auth.guard";
import { addressesDocs } from "./addresses.docs";
import { createUserAddress, deleteUserAddress, listAddresses, updateUserAddress } from "./addresses.service";
import { parseCreate, parsePatch } from "./addresses.validation";

const idParams = t.Object({ id: t.String({ format: "uuid" }) });

// TypeBox di sini hanya memeriksa TIPE dan membatasi ukuran kasar (agar badan permintaan tidak raksasa).
// Aturan isi yang sebenarnya (trim, telepon, provinsi, koordinat) ada di addresses.validation.ts.
const text = (max: number) => t.String({ maxLength: max });
const nullableText = (max: number) => t.Union([t.String({ maxLength: max }), t.Null()]);
const nullableNumber = t.Union([t.Number(), t.Null()]);

const createBody = t.Object({
  label: t.Optional(nullableText(200)),
  recipient_name: text(500),
  phone: text(100),
  full_address: text(2000),
  province: text(200),
  city: text(500),
  kecamatan: t.Optional(nullableText(500)),
  kelurahan: t.Optional(nullableText(500)),
  postal_code: t.Optional(nullableText(50)),
  latitude: t.Optional(nullableNumber),
  longitude: t.Optional(nullableNumber),
  is_default: t.Optional(t.Boolean()),
});

const patchBody = t.Object({
  label: t.Optional(text(200)),
  recipient_name: t.Optional(text(500)),
  phone: t.Optional(text(100)),
  full_address: t.Optional(text(2000)),
  province: t.Optional(text(200)),
  city: t.Optional(text(500)),
  kecamatan: t.Optional(nullableText(500)),
  kelurahan: t.Optional(nullableText(500)),
  postal_code: t.Optional(nullableText(50)),
  latitude: t.Optional(nullableNumber),
  longitude: t.Optional(nullableNumber),
  is_default: t.Optional(t.Boolean()),
});

// Buku alamat hanya untuk user login (requireAuth). user_id SELALU dari token, tidak pernah dari body atau URL.
export const addressesRoutes = new Elysia({ prefix: "/addresses" })
  .use(requireAuth)
  // Nama, telepon, dan alamat adalah data pribadi: jangan tersimpan di cache bersama (CDN/proxy).
  .onAfterHandle(({ set }) => {
    set.headers["cache-control"] = "private, no-store";
  })
  .get("", ({ user }) => listAddresses(user.id).then((data) => ({ data })), { detail: addressesDocs.get })
  .post(
    "",
    async ({ user, body, set }) => {
      const data = await createUserAddress(user.id, { ...parseCreate(body), is_default: body.is_default });
      set.status = 201;
      return { data };
    },
    { detail: addressesDocs.post, body: createBody },
  )
  .patch(
    "/:id",
    async ({ user, params, body }) => {
      const patch = parsePatch(body);
      if (Object.keys(patch).length === 0 && body.is_default === undefined) {
        throw new AppError(422, "VALIDATION_FAILED", "Tidak ada data yang diubah.");
      }
      const data = await updateUserAddress(user.id, params.id, patch, body.is_default);
      return { data };
    },
    { detail: addressesDocs.patch, params: idParams, body: patchBody },
  )
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      await deleteUserAddress(user.id, params.id);
      set.status = 204;
    },
    { detail: addressesDocs.delete, params: idParams },
  );
