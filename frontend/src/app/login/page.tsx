"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShell, Divider, Field, FormError, GoogleButton, SubmitButton } from "@/components/AuthUi";
import { afterLogin, login } from "@/lib/authApi";
import { useAuthStore } from "@/lib/authStore";
import { describeError } from "@/lib/http";
import { safeNext } from "@/lib/redirect";

const schema = z.object({
  email: z.string().min(1, "Email wajib diisi").email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});
type Values = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // `next` datang dari URL: hanya path internal yang diterima (anti open-redirect)
  const next = safeNext(params.get("next"));
  const status = useAuthStore((s) => s.status);
  const submitting = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  // Sudah login saat membuka halaman ini → langsung ke tujuan (bukan saat proses login sendiri berjalan)
  useEffect(() => {
    if (status === "authenticated" && !submitting.current) router.replace(next);
  }, [status, next, router]);

  const onSubmit = async (values: Values) => {
    submitting.current = true;
    try {
      await login(values.email, values.password);
      await afterLogin(); // muat keranjang + jalankan pilihan "tambah ke keranjang" yang tertunda
      router.replace(next);
    } catch (error) {
      submitting.current = false;
      setError("root", { message: describeError(error) });
    }
  };

  const withNext = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell title="Masuk" subtitle="Masuk untuk menyimpan barang di keranjang dan melanjutkan belanja.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <FormError message={errors.root?.message} />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <SubmitButton loading={isSubmitting}>Masuk</SubmitButton>
      </form>
      <Divider />
      <GoogleButton next={next} />
      <p className="mt-6 text-center text-[13px] text-soft">
        Belum punya akun?{" "}
        <Link href={`/register${withNext}`} className="font-semibold text-olive">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}

// useSearchParams harus di dalam Suspense agar halaman bisa di-build
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
