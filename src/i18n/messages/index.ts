import type { Locale } from "../config";
import { en } from "./en";
import { it, type Messages } from "./it";

export const MESSAGES: Record<Locale, Messages> = { it, en };
export type { Messages };
