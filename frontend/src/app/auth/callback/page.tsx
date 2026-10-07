"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthUi";
import { afterLogin } from "@/lib/authApi";
import { refreshSession } from "@/lib/http";
import { takeNext } from "@/lib/redirect";

// Kode ?error= dari backend (GET /api/auth/google/callback) → pesan untuk user
const ERROR_MESSAGES: Record<string, string> = {
  google_state_mismatch: "Permintaan masuk tidak valid atau sudah kedaluwarsa. Silakan coba lagi.",
  google_access_denied: "Anda membatalkan proses masuk dengan Google.",
  google_exchange_failed: "Gagal menghubungi Google. Silakan coba lagi.",
  google_email_unverified: "Email pada akun Google Anda belum terverifikasi.",
  google_email_invalid: "Email dari akun Google ini tidak dapat dipakai.",
  google_account_conflict: "Email ini sudah tertaut ke akun Google yang lain.",
  google_account_disabled: "Akun ini sudah dinonaktifkan.",
  google_login_failed: "Gagal masuk dengan Google. Silakan coba lagi.",
  google_auth_disabled: "Masuk dengan Google belum diaktifkan.",
};

const GENERIC_ERROR = "Terjadi kendala saat masuk. Silakan coba lagi.";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const errorCode = params.get("error");
  const [sessionFailed, setSessionFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (errorCode || started.current) return;
    started.current = true; // React Strict Mode menjalankan efek dua kali di development

    (async () => {
      // Backend sudah memasang cookie refresh token; access token diambil lewat /refresh (tidak lewat URL)
      const session = await refreshSession();
      if (!session) {
        setSessionFailed(true);
        return;
      }
      await afterLogin(); // muat keranjang + jalankan pilihan "tambah ke keranjang" yang tertunda
      router.replace(takeNext());
    })();
  }, [errorCode, router]);

  if (errorCode || sessionFailed) {
    const message = errorCode ? (ERROR_MESSAGES[errorCode] ?? GENERIC_ERROR) : "Sesi masuk tidak ditemukan. Silakan masuk lagi.";
    return (
      <AuthShell title="Gagal masuk">
        <p role="alert" className="text-sm leading-[1.55] text-ink">
          {message}
        </p>
        <Link
          href="/login"
          className="mt-6 block rounded-full bg-olive py-3.5 text-center text-[13px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-olive-d hover:text-bg"
        >
          Kembali ke halaman masuk
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Memproses…">
      <p className="text-sm text-soft">Menyelesaikan proses masuk, mohon tunggu sebentar.</p>
    </AuthShell>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
