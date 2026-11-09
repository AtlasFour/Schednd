export type FormState = { error?: string; success?: string };

export const initialFormState: FormState = {};

/** Esito di un'azione che, se riuscita, porta a un'altra pagina. */
export type NavResult = FormState & { redirectTo?: string };

export function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function getOptionalString(formData: FormData, key: string): string | null {
  const value = getString(formData, key);
  return value === "" ? null : value;
}

export function getOptionalInt(formData: FormData, key: string): number | null {
  const value = getString(formData, key);
  if (value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

export function isDate(value: string) {
  return DATE_RE.test(value);
}

export function isTime(value: string) {
  return TIME_RE.test(value);
}

/** Messaggio leggibile a partire da un errore di Supabase/Postgres. */
export function dbErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error) return "Si è verificato un errore.";
  // Le funzioni SQL dell'app sollevano messaggi già in italiano (codice P0001).
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "23514") return "Alcuni valori non sono validi.";
  return "Si è verificato un errore. Riprova tra poco.";
}
