"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cx } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { setLanguage } from "./actions";

const LANGUAGES: { id: Locale; label: string; flag: string }[] = [
  { id: "it", label: "Italiano", flag: "🇮🇹" },
  { id: "en", label: "English", flag: "🇬🇧" },
];

/** Scelta della lingua: salvata nell'account (notifiche) e sul dispositivo. */
export function LanguagePicker({ current }: { current: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="radiogroup" aria-label="Lingua / Language" className="grid grid-cols-2 gap-3">
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={current === l.id}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLanguage(l.id);
              router.refresh();
            })
          }
          className={cx(
            "ui-btn flex items-center gap-2 rounded-xl border-2 p-3 text-left font-medium disabled:opacity-60",
            current === l.id ? "border-brand bg-brand/10" : "border-foreground/15",
          )}
        >
          <span aria-hidden>{l.flag}</span>
          {l.label}
        </button>
      ))}
    </div>
  );
}
