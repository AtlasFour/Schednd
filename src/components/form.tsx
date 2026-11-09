"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonClass, cx, type ButtonVariant } from "./ui";
import type { FormState } from "@/lib/form";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  small,
  className,
  confirm,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  small?: boolean;
  className?: string;
  /** Se presente, chiede conferma prima di inviare. */
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(buttonClass(variant, small), className)}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? (pendingLabel ?? "Attendi…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-red-500">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
        {state.success}
      </p>
    );
  }
  return null;
}
