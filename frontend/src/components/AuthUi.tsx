"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import Toast from "./Toast";
import { Reveal } from "./Reveal";
import { API_BASE } from "@/lib/http";
import { saveNext } from "@/lib/redirect";

// Bagian UI yang dipakai bersama halaman login, register, dan callback.

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <Navbar />
      <main className="px-[5vw] pb-[60px] pt-[130px]">
        <div className="mx-auto w-full max-w-[440px]">
          <Reveal>
            <h1 className="disp" style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 0.95, letterSpacing: "-0.03em" }}>
              {title}
            </h1>
            {subtitle && <p className="mt-3 text-sm leading-[1.55] text-soft">{subtitle}</p>}
          </Reveal>
          <div className="mt-8 rounded-[18px] border border-line bg-bg-soft p-6 sm:p-8">{children}</div>
        </div>
      </main>
      <Footer />
      <Toast />
    </div>
  );
}

// forwardRef WAJIB: react-hook-form (register) membaca nilai input lewat ref. Tanpa ini ref tidak sampai ke <input>
// dan nilai form terbaca kosong.
export const Field = forwardRef<HTMLInputElement, { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>>(
  function Field({ label, error, ...input }, ref) {
  const id = input.id ?? input.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive aria-[invalid=true]:border-red-700"
        {...input}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
});

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-700/30 bg-red-700/5 px-4 py-3 text-[13px] text-red-700">
      {message}
    </p>
  );
}

export function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-full bg-olive py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-olive-d disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Memproses…" : children}
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-6 flex items-center gap-4 text-xs text-soft">
      <span className="h-px flex-1 bg-line" />
      atau
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

// Login Google = pindah halaman penuh ke backend (bukan fetch): Google mengembalikan user lewat redirect.
// Tujuan setelah login dititipkan di sessionStorage karena `next` tidak ikut dalam perjalanan ke Google dan kembali.
export function GoogleButton({ next }: { next: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        saveNext(next);
        window.location.assign(`${API_BASE}/auth/google`);
      }}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-ink py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-ink hover:text-bg"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Masuk dengan Google
    </button>
  );
}
