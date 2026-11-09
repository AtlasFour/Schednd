import type { SupabaseClient } from "@supabase/supabase-js";
import { capitalize, formatShortDate, formatTime } from "./schedule";

export type ProposalType = "reschedule" | "skip" | "change_game";
export type ProposalStatus = "open" | "needs_owner" | "approved" | "rejected" | "cancelled";

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, { label: string; emoji: string; hint: string }> = {
  reschedule: {
    label: "Cambio data",
    emoji: "📅",
    hint: "Proponi una o più date alternative per questo incontro.",
  },
  skip: {
    label: "Saltare l'incontro",
    emoji: "⏭️",
    hint: "Proponi di non giocare questa volta.",
  },
  change_game: {
    label: "Cambio gioco",
    emoji: "🎲",
    hint: "Proponi uno o più giochi diversi per questo incontro.",
  },
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  open: "Votazione aperta",
  needs_owner: "Pareggio: decide l'owner",
  approved: "Approvata",
  rejected: "Respinta",
  cancelled: "Annullata",
};

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

export const PROPOSAL_SELECT =
  "id, type, reason, created_by, created_at, closes_at, status, winning_option_id, proposal_options(id, position, new_start_date, new_start_time, game_title), ballots(user_id, option_ids)";

export function isOpen(status: ProposalStatus) {
  return status === "open" || status === "needs_owner";
}

export function optionLabel(type: ProposalType, option: ProposalOptionRow): string {
  if (type === "skip") return "Sì, saltiamo";
  if (type === "change_game") return option.game_title ?? "—";
  if (option.new_start_date && option.new_start_time) {
    return `${capitalize(formatShortDate(option.new_start_date))} · ${formatTime(option.new_start_time)}`;
  }
  return "—";
}

/** "lun 10 nov, 21:00" nel fuso del gruppo. */
export function formatDeadline(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function fetchProposals(supabase: SupabaseClient, occurrenceId: string) {
  const { data, error } = await supabase
    .from("proposals")
    .select(PROPOSAL_SELECT)
    .eq("occurrence_id", occurrenceId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchProposals", error);
    return [];
  }
  const rows = (data ?? []) as ProposalRow[];
  for (const p of rows) p.proposal_options.sort((a, b) => a.position - b.position);
  // Prima le aperte, poi le chiuse (più recenti in alto).
  return rows.sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)));
}

/** Chiude le proposte scadute nei gruppi dell'utente. */
export async function closeDueProposals(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("close_due_proposals");
  if (error) console.error("close_due_proposals", error);
}
