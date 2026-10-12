/**
 * Bentuk UUID apa pun (8-4-4-4-12 heksadesimal), tanpa memeriksa nomor versi.
 *
 * Kenapa bukan `format: "uuid"` bawaan Elysia: format itu hanya menerima UUID RFC 4122 yang ketat (versi 1-8), padahal
 * id produk seed sengaja tetap dan "polos" (`00000000-0000-0000-0000-000000000001`) supaya `db:seed` bisa diulang.
 * Id seperti itu ditolak validator bawaan. Pakai pola ini untuk id yang bisa berasal dari seed (produk).
 */
export const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
