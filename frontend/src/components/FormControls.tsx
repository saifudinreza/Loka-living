"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

// Kontrol form tambahan (pasangan `Field` di AuthUi). Semuanya forwardRef: react-hook-form membaca nilai lewat ref.

const base =
  "w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive aria-[invalid=true]:border-red-700";

function Wrapper({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export const SelectField = forwardRef<
  HTMLSelectElement,
  { label: string; error?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>
>(function SelectField({ label, error, children, ...select }, ref) {
  const id = select.id ?? select.name ?? label;
  return (
    <Wrapper id={id} label={label} error={error}>
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={base}
        {...select}
      >
        {children}
      </select>
    </Wrapper>
  );
});

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  { label: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextAreaField({ label, error, ...area }, ref) {
  const id = area.id ?? area.name ?? label;
  return (
    <Wrapper id={id} label={label} error={error}>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${base} resize-none`}
        {...area}
      />
    </Wrapper>
  );
});

export const CheckboxField = forwardRef<
  HTMLInputElement,
  { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>
>(function CheckboxField({ label, hint, ...input }, ref) {
  const id = input.id ?? input.name ?? label;
  return (
    <div className="flex items-start gap-3">
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--olive)] disabled:cursor-not-allowed"
        {...input}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-[13.5px] text-ink">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs leading-[1.5] text-soft">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
});
