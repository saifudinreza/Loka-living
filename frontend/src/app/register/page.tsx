"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShell, Divider, Field, FormError, GoogleButton, SubmitButton } from "@/components/AuthUi";
import { afterLogin, register as registerAccount } from "@/lib/authApi";
import { useAuthStore } from "@/lib/authStore";
import { ApiError, describeError } from "@/lib/http";
import { safeNext } from "@/lib/redirect";

// Batas sama dengan backend (password 8–72 karakter, nama 1–120 karakter)
const schema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(120, "Nama maksimal 120 karakter"),
  email: z.string().min(1, "Email wajib diisi").email("Format email tidak valid"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(72, "Password maksimal 72 karakter"),
});
type Values = z.infer<typeof schema>;

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const status = useAuthStore((s) => s.status);
  const submitting = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (status === "authenticated" && !submitting.current) router.replace(next);
  }, [status, next, router]);

  const onSubmit = async (values: Values) => {
    submitting.current = true;
    try {
      await registerAccount(values.name, values.email, values.password);
      await afterLogin();
      router.replace(next);
    } catch (error) {
      submitting.current = false;
      if (error instanceof ApiError && error.code === "EMAIL_TAKEN") {
        setError("email", { message: error.message });
      } else {
        setError("root", { message: describeError(error) });
      }
    }
  };

  const withNext = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell title="Daftar" subtitle="Buat akun untuk menyimpan keranjang dan mempermudah belanja berikutnya.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <FormError message={errors.root?.message} />
        <Field label="Nama" autoComplete="name" error={errors.name?.message} {...register("name")} />
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <p className="-mt-2 text-xs text-soft">Minimal 8 karakter.</p>
        <SubmitButton loading={isSubmitting}>Daftar</SubmitButton>
      </form>
      <Divider />
      <GoogleButton next={next} />
      <p className="mt-6 text-center text-[13px] text-soft">
        Sudah punya akun?{" "}
        <Link href={`/login${withNext}`} className="font-semibold text-olive">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
