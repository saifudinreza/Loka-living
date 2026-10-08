"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AddressForm from "@/components/AddressForm";
import Footer from "@/components/Footer";
import Modal from "@/components/Modal";
import Navbar from "@/components/Navbar";
import Toast from "@/components/Toast";
import { Reveal } from "@/components/Reveal";
import { type Address, MAX_ADDRESSES } from "@/lib/addressSchema";
import { useAddressStore } from "@/lib/addressStore";
import { useAuthStore } from "@/lib/authStore";
import { ApiError, describeError } from "@/lib/http";
import { useToastStore } from "@/lib/toastStore";

const pillSecondary =
  "rounded-full border border-line px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";

function regionLine(a: Address) {
  return [a.kelurahan, a.kecamatan, a.city, a.province].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
}

export default function AddressesPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const addresses = useAddressStore((s) => s.addresses);
  const load = useAddressStore((s) => s.load);
  const setDefault = useAddressStore((s) => s.setDefault);
  const remove = useAddressStore((s) => s.remove);
  const showToast = useToastStore((s) => s.show);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // alamat yang sedang diproses (cegah klik ganda)
  const [error, setError] = useState<string | null>(null);

  // Buku alamat hanya untuk user login: tamu diarahkan ke login, lalu kembali ke sini
  useEffect(() => {
    if (status === "guest") router.replace("/login?next=%2Faccount%2Faddresses");
  }, [status, router]);

  // Selalu muat ulang saat halaman dibuka: alamat bisa berubah dari tab atau perangkat lain
  useEffect(() => {
    if (status !== "authenticated") return;
    load().catch((e) => setError(describeError(e)));
  }, [status, load]);

  const ready = status === "authenticated" && addresses !== null;
  const count = addresses?.length ?? 0;
  const full = count >= MAX_ADDRESSES;

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (address: Address) => {
    setEditing(address);
    setFormOpen(true);
  };

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.code === "ADDRESS_NOT_FOUND") {
        // sudah dihapus di tempat lain: tampilkan keadaan terbaru, bukan galat mentah
        await load().catch(() => undefined);
        showToast("Alamat ini sudah tidak ada");
      } else {
        setError(describeError(e));
      }
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const target = deleting;
    if (!target) return;
    setDeleting(null);
    await run(target.id, async () => {
      await remove(target.id); // daftar dimuat ulang dari server: server yang menentukan alamat utama berikutnya
      showToast("Alamat dihapus");
    });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <Navbar />
      <main className="px-[5vw] pb-[60px] pt-[130px]">
        <Reveal>
          <h1 className="disp" style={{ fontSize: "clamp(40px,6vw,88px)", lineHeight: 0.92, letterSpacing: "-0.04em" }}>
            Alamat Saya
          </h1>
        </Reveal>

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-700">
            {error}
          </p>
        )}

        {!ready && (
          <p className="mt-10 text-sm text-soft" aria-live="polite">
            {status === "guest" ? "Mengalihkan ke halaman masuk…" : "Memuat alamat…"}
          </p>
        )}

        {ready && (
          <div className="mt-10 max-w-[820px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-soft" aria-live="polite">
                <span className="font-semibold text-ink">{count}</span>/{MAX_ADDRESSES} alamat
              </p>
              <button
                onClick={openAdd}
                disabled={full}
                className="rounded-full bg-olive px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-olive-d disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tambah alamat
              </button>
            </div>
            {full && (
              <p className="mt-3 text-xs text-soft">Maksimal {MAX_ADDRESSES} alamat. Hapus salah satu untuk menambah yang baru.</p>
            )}

            {addresses.length === 0 ? (
              <div className="mt-8 rounded-[18px] border border-line bg-bg-soft p-8">
                <p className="text-base text-ink">Belum ada alamat tersimpan.</p>
                <p className="mt-2 text-sm text-soft">Tambahkan alamat pertama Anda. Alamat pertama otomatis menjadi alamat utama.</p>
              </div>
            ) : (
              <ul className="mt-8 flex flex-col gap-4">
                {addresses.map((a) => {
                  const busy = busyId === a.id;
                  return (
                    <li key={a.id} className="rounded-[18px] border border-line bg-bg-soft p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-[17px] font-medium text-ink">{a.label}</h2>
                        {a.is_default && (
                          <span className="rounded-full bg-olive px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-bg">
                            Utama
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm text-ink">
                        {a.recipient_name} · {a.phone}
                      </p>
                      <p className="mt-1 text-sm leading-[1.55] text-soft">{a.full_address}</p>
                      <p className="text-sm leading-[1.55] text-soft">{regionLine(a)}</p>

                      <div className="mt-5 flex flex-wrap gap-3">
                        {!a.is_default && (
                          <button disabled={busy} onClick={() => run(a.id, () => setDefault(a.id))} className={pillSecondary}>
                            Jadikan utama
                          </button>
                        )}
                        <button disabled={busy} onClick={() => openEdit(a)} className={pillSecondary}>
                          Ubah
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => setDeleting(a)}
                          className="px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-soft underline-offset-4 transition-colors hover:text-red-700 hover:underline disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </main>
      <Footer />
      <Toast />

      <AddressForm
        open={formOpen}
        address={editing}
        isFirst={count === 0}
        onClose={() => setFormOpen(false)}
      />

      <Modal open={deleting !== null} title="Hapus alamat?" onClose={() => setDeleting(null)}>
        {deleting && (
          <>
            <p className="text-sm leading-[1.6] text-ink">
              Alamat <strong>{deleting.label}</strong> akan dihapus dan tidak bisa dikembalikan.
              {deleting.is_default && count > 1 && " Alamat terbaru yang tersisa akan menjadi alamat utama."}
            </p>
            <p className="mt-2 text-xs text-soft">Pesanan yang sudah dibuat tidak terpengaruh.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setDeleting(null)} className={pillSecondary}>
                Batal
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-full bg-ink px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-bg transition-opacity hover:opacity-85"
              >
                Hapus
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
