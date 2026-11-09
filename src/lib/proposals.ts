import type { SupabaseClient } from "@supabase/supabase-js";
import { intlLocale, type Locale } from "../i18n/config";
import type { Messages } from "../i18n/messages";
import { capitalize, formatShortDate, formatTime } from "./schedule";

export type ProposalType = "reschedule" | "skip" | "change_game";
export type ProposalStatus = "open" | "needs_owner" | "approved" | "rejected" | "cancelled";

export const PROPOSAL_TYPES: ProposalType[] = ["reschedule", "change_game", "skip"];

export type ProposalOptionRow = {
  id: string;
  position: number;
  new_start_date: string | null;
  new_start_time: string | null;
  game_title: string | null;
};

export type BallotRow = { user_id: string; option_ids: string[] };

export type ProposalRow = {
  id: string;
  type: ProposalType;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  closes_at: string;
  status: ProposalStatus;
  winning_option_id: string | null;
  proposal_options: ProposalOptionRow[];
  ballots: BallotRow[];
};

// Tra proposals e proposal_options ci sono due collegamenti (le opzioni della
// proposta e l'opzione vincente): va indicato quale usare, altrimenti
// Supabase risponde con un errore di ambiguità.
export const PROPOSAL_SELECT =
  "id, type, reason, created_by, created_at, closes_at, status, winning_option_id, proposal_options!proposal_options_proposal_id_fkey(id, position, new_start_date, new_start_time, game_title), ballots(user_id, option_ids)";

export function isOpen(status: ProposalStatus) {
  return status === "open" || status === "needs_owner";
}

export function optionLabel(
  type: ProposalType,
  option: ProposalOptionRow,
  m: Messages,
  locale: Locale,
): string {
  if (type === "skip") return m.labels.skipYes;
  if (type === "change_game") return option.game_title ?? "—";
  if (option.new_start_date && option.new_start_time) {
    return `${capitalize(formatShortDate(option.new_start_date, locale))} · ${formatTime(option.new_start_time)}`;
  }
  return "—";
}

/** "lun 10 nov, 21:00" nel fuso del gruppo. */
export function formatDeadline(iso: string, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Proposte di un incontro; null se il caricamento non riesce. */
export async function fetchProposals(
  supabase: SupabaseClient,
  occurrenceId: string,
): Promise<ProposalRow[] | null> {
  const { data, error } = await supabase
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("occurrence_id", occurrenceId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchProposals", error);
    return null;
  }
  const rows = (data ?? []) as ProposalRow[];
  for (const p of rows) p.proposal_options.sort((a, b) => a.position - b.position);
  // Prima le aperte, poi le chiuse (più recenti in alto).
  return rows.sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)));
}
