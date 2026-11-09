"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

type Theme = "classic" | "pixel";
const STORAGE_KEY = "schednd-theme";

const THEMES: { id: Theme; label: string; description: string; swatches: string[] }[] = [
  {
    id: "classic",
    label: "Classico",
    description: "Pulito, chiaro o scuro secondo il telefono.",
    swatches: ["#ffffff", "#6d28d9", "#16161d"],
  },
  {
    id: "pixel",
    label: "Pixel art 👾",
    description: "Retrò a 8 bit: font pixel, bordi spessi, ombre piene.",
    swatches: ["#1a1c2c", "#b13e53", "#ffcd75", "#41a6f6"],
  },
];

/** Salva il tema su questo dispositivo e lo applica subito alla pagina. */
function applyTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Navigazione privata: il tema vale solo per questa sessione.
  }
  const root = document.documentElement;
  if (theme === "pixel") root.setAttribute("data-theme", "pixel");
  else root.removeAttribute("data-theme");
}

/** Scelta del tema grafico, salvata su questo dispositivo. */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("classic");

  useEffect(() => {
    // Il tema attuale è già stato applicato dallo script nel layout.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.dataset.theme === "pixel" ? "pixel" : "classic");
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Tema grafico" className="grid grid-cols-2 gap-3">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          onClick={() => choose(t.id)}
          className={cx(
            "ui-btn flex flex-col items-start gap-2 rounded-xl border-2 p-3 text-left",
            theme === t.id ? "border-brand bg-brand/10" : "border-foreground/15",
          )}
        >
          <span className="flex gap-1" aria-hidden>
            {t.swatches.map((c) => (
              <span key={c} className="size-4 border border-black/20" style={{ backgroundColor: c }} />
            ))}
          </span>
          <span className="font-medium">{t.label}</span>
          <span className="text-xs text-foreground/60">{t.description}</span>
        </button>
      ))}
    </div>
  );
}
