"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./http";

// Daftar provinsi dari backend (GET /api/shipping/provinces, 38 provinsi). Nama yang dikirim balik HARUS persis sama dengan
// daftar ini: backend menghitung zona ongkir dari nama provinsi, dan nama lain (mis. "Jakarta") membuat tarif salah.
//
// Hasil dan permintaannya dibagi di tingkat modul: banyak komponen (form alamat, checkout) memakai daftar yang sama,
// tapi permintaannya hanya satu. Kegagalan TIDAK disimpan, jadi bisa dicoba lagi.

let cached: string[] | null = null;
let inflight: Promise<string[]> | null = null;

export function loadProvinces(): Promise<string[]> {
  if (cached) return Promise.resolve(cached);
  inflight ??= apiFetch<{ data: string[] }>("/shipping/provinces")
    .then(({ data }) => {
      cached = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Hanya untuk test. */
export function resetProvincesCache() {
  cached = null;
  inflight = null;
}

type Status = "loading" | "ready" | "error";

export function useProvinces() {
  const [provinces, setProvinces] = useState<string[]>(cached ?? []);
  const [status, setStatus] = useState<Status>(cached ? "ready" : "loading");

  const load = useCallback(() => {
    setStatus("loading");
    loadProvinces().then(
      (list) => {
        setProvinces(list);
        setStatus("ready");
      },
      () => setStatus("error"),
    );
  }, []);

  useEffect(() => {
    if (!cached) load();
  }, [load]);

  return { provinces, status, retry: load };
}
