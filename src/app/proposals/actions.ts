"use server";

import { revalidateApp } from "@/lib/revalidate";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage, getString, isDate, isTime, type FormState } from "@/lib/form";
import type { ProposalType } from "@/lib/proposals";

const TYPES: ProposalType[] = ["reschedule", "skip", "change_game"];

export async function createProposal(
  groupId: string,
  originalDate: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const type = getString(formData, "type") as ProposalType;
  if (!TYPES.includes(type) || !isDate(originalDate)) {
    return { error: "Scegli che cosa proporre." };
  }

  let options: { date?: string; time?: string; game?: string }[] = [];

  if (type === "reschedule") {
    const dates = formData.getAll("option_date").map(String);
    const times = formData.getAll("option_time").map(String);
    options = dates
      .map((date, i) => ({ date: date.trim(), time: (times[i] ?? "").trim() }))
      .filter((o) => o.date || o.time);
    if (options.length === 0) return { error: "Aggiungi almeno una data." };
    if (options.some((o) => !isDate(o.date!) || !isTime(o.time!))) {
      return { error: "Ogni data proposta deve avere giorno e orario." };
    }
    const keys = new Set(options.map((o) => `${o.date} ${o.time}`));
    if (keys.size !== options.length) return { error: "Hai inserito due volte la stessa data." };
  }

  if (type === "change_game") {
    options = formData
      .getAll("option_game")
      .map((g) => ({ game: String(g).trim() }))
      .filter((o) => o.game);
    if (options.length === 0) return { error: "Aggiungi almeno un gioco." };
    if (options.some((o) => o.game!.length > 120)) {
      return { error: "Il nome di un gioco può avere al massimo 120 caratteri." };
    }
  }

  if (options.length > 6) return { error: "Puoi proporre al massimo 6 opzioni." };

  const reason = getString(formData, "reason");
  if (reason.length > 500) return { error: "Il messaggio può avere al massimo 500 caratteri." };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("create_proposal", {
    p_group_id: groupId,
    p_original_date: originalDate,
    p_type: type,
    p_options: options,
    p_reason: reason || null,
  });

  if (error) {
    console.error("create_proposal", error);
    return { error: dbErrorMessage(error) };
  }

  revalidateApp();
  redirect(`/groups/${groupId}/${originalDate}#proposte`);
}

export async function castVote(proposalId: string, optionIds: string[]): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cast_vote", {
    p_proposal_id: proposalId,
    p_option_ids: optionIds,
  });
  if (error) {
    console.error("cast_vote", error);
    return { error: dbErrorMessage(error) };
  }
  revalidateApp();
  return {};
}

export async function decideProposal(
  proposalId: string,
  optionId: string | null,
): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("decide_proposal", {
    p_proposal_id: proposalId,
    p_option_id: optionId,
  });
  if (error) {
    console.error("decide_proposal", error);
    return { error: dbErrorMessage(error) };
  }
  revalidateApp();
  return {};
}

export async function cancelProposal(proposalId: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_proposal", { p_proposal_id: proposalId });
  if (error) {
    console.error("cancel_proposal", error);
    return { error: dbErrorMessage(error) };
  }
  revalidateApp();
  return {};
}
