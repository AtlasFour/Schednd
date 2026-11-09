import type { Locale } from "../i18n/config";
import { addDays } from "./schedule";

const MONTHS: Record<Locale, string[]> = {
  it: [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

export const WEEKDAY_INITIALS: Record<Locale, string[]> = {
  it: ["L", "M", "M", "G", "V", "S", "D"],
  en: ["M", "T", "W", "T", "F", "S", "S"],
};

export type Month = { year: number; month: number }; // month: 1-12

/** "2026-11" → { year: 2026, month: 11 }; valore non valido → null */
export function parseMonth(value: unknown): Month | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { year, month };
}

export function monthOf(date: string): Month {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

export function formatMonthParam({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** "Novembre 2026" / "November 2026" */
export function monthLabel({ year, month }: Month, locale: Locale = "it"): string {
  const name = MONTHS[locale][month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function firstDay({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function lastDay(m: Month): string {
  return addDays(firstDay(shiftMonth(m, 1)), -1);
}

/**
 * Settimane del mese (da lunedì a domenica), con i giorni dei mesi
 * adiacenti per completare la prima e l'ultima riga.
 */
export function monthGrid(m: Month): string[][] {
  const first = firstDay(m);
  const [y, mo, d] = first.split("-").map(Number);
  const isoWeekday = ((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7) + 1; // 1 = lunedì
  let day = addDays(first, -(isoWeekday - 1));
  const last = lastDay(m);
  const weeks: string[][] = [];
  while (day <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Colori distinti per i gruppi (stabili: dipendono dall'id del gruppo). */
export const GROUP_COLORS = [
  "#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#14b8a6", "#8b5cf6",
];

export function groupColor(groupId: string, index?: number): string {
  if (index !== undefined) return GROUP_COLORS[index % GROUP_COLORS.length];
  let hash = 0;
  for (const ch of groupId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[hash % GROUP_COLORS.length];
}
