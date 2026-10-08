"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormError, SubmitButton } from "./AuthUi";
import { CheckboxField, SelectField, TextAreaField } from "./FormControls";
import Modal from "./Modal";
import {
  type Address,
  type AddressFormValues,
  addressFormSchema,
  emptyAddressForm,
  formFromAddress,
  toCreatePayload,
  toPatchPayload,
} from "@/lib/addressSchema";
import { useAddressStore } from "@/lib/addressStore";
import { ApiError, describeError } from "@/lib/http";
import { useToastStore } from "@/lib/toastStore";
import { useProvinces } from "@/lib/useProvinces";

interface Props {
  open: boolean;
  /** null = tambah alamat baru */
  address: Address | null;
  /** alamat pertama otomatis menjadi utama */
  isFirst: boolean;
  onClose: () => void;
}

export default function AddressForm({ open, address, isFirst, onClose }: Props) {
  const { provinces, status: provinceStatus, retry } = useProvinces();
  const create = useAddressStore((s) => s.create);
  const update = useAddressStore((s) => s.update);
  const load = useAddressStore((s) => s.load);
  const showToast = useToastStore((s) => s.show);

  // alamat utama (atau alamat pertama) tidak bisa "dilepas": pindahkan dengan menjadikan alamat lain utama
  const defaultLocked = address ? address.is_default : isFirst;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: emptyAddressForm(),
  });

  // isi ulang setiap kali dialog dibuka (atau beralih ke alamat lain)
  useEffect(() => {
    if (open) reset(address ? formFromAddress(address) : emptyAddressForm(isFirst));
  }, [open, address, isFirst, reset]);

  const onSubmit = async (values: AddressFormValues) => {
    try {
      if (address) {
        const payload = toPatchPayload(values, address);
        if (Object.keys(payload).length === 0) {
          onClose(); // tidak ada yang berubah: tidak perlu request
          return;
        }
        await update(address.id, payload);
        showToast("Alamat diperbarui");
      } else {
        await create(toCreatePayload({ ...values, is_default: defaultLocked ? false : values.is_default }));
        showToast("Alamat ditambahkan");
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === "ADDRESS_NOT_FOUND") {
        // alamat sudah dihapus di tab/perangkat lain: tutup form dan tampilkan keadaan terbaru
        await load().catch(() => undefined);
        showToast("Alamat ini sudah tidak ada");
        onClose();
        return;
      }
      setError("root", { message: describeError(error) });
    }
  };

  return (
    <Modal open={open} title={address ? "Ubah alamat" : "Tambah alamat"} onClose={onClose} dismissible={!isSubmitting}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormError message={errors.root?.message} />

        <Field label="Label (mis. Rumah, Kantor)" error={errors.label?.message} {...register("label")} />
        <Field label="Nama penerima" autoComplete="name" error={errors.recipient_name?.message} {...register("recipient_name")} />
        <Field label="Nomor telepon" type="tel" autoComplete="tel" inputMode="tel" error={errors.phone?.message} {...register("phone")} />

        <div>
          <SelectField label="Provinsi" error={errors.province?.message} disabled={provinceStatus === "loading"} {...register("province")}>
            <option value="">{provinceStatus === "loading" ? "Memuat provinsi…" : "Pilih provinsi"}</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectField>
          {provinceStatus === "error" && (
            <p role="alert" className="mt-1.5 text-[12.5px] text-red-700">
              Gagal memuat daftar provinsi.{" "}
              <button type="button" onClick={retry} className="font-semibold underline underline-offset-2">
                Coba lagi
              </button>
            </p>
          )}
        </div>

        <Field label="Kota / kabupaten" autoComplete="address-level2" error={errors.city?.message} {...register("city")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kecamatan (opsional)" error={errors.kecamatan?.message} {...register("kecamatan")} />
          <Field label="Kelurahan (opsional)" error={errors.kelurahan?.message} {...register("kelurahan")} />
        </div>
        <Field
          label="Kode pos (opsional)"
          inputMode="numeric"
          autoComplete="postal-code"
          error={errors.postal_code?.message}
          {...register("postal_code")}
        />
        <TextAreaField label="Alamat lengkap" autoComplete="street-address" error={errors.full_address?.message} {...register("full_address")} />

        {defaultLocked ? (
          // tidak didaftarkan ke form (input disabled tidak ikut terkirim); selalu tercentang dan tidak bisa diubah
          <CheckboxField
            name="is_default_locked"
            label="Jadikan alamat utama"
            checked
            disabled
            readOnly
            hint={address ? "Ini alamat utama. Untuk memindahkannya, jadikan alamat lain sebagai utama." : "Alamat pertama otomatis menjadi alamat utama."}
          />
        ) : (
          <CheckboxField label="Jadikan alamat utama" {...register("is_default")} />
        )}

        <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-line px-7 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink disabled:opacity-60"
          >
            Batal
          </button>
          <div className="sm:min-w-[160px]">
            <SubmitButton loading={isSubmitting}>Simpan</SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
