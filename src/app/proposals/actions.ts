"use server";

import { afterMutation } from "@/lib/revalidate";
import { requireUser } from "@/lib/auth";
import {getString, isDate, isTime, type FormState, type NavResult} from "@/lib/form";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import type { ProposalType } from "@/lib/proposals";

const TYPES: ProposalType[] = ["reschedule", "skip", "change_game"];

export async function createProposal(
  groupId: string,
  originalDate: string,
  _prev: NavResult,
  formData: FormData,
): Promise<NavResult> {
  const { m } = await getI18n();
  const type = getString(formData, "type") as ProposalType;
  if (!TYPES.includes(type) || !isDate(originalDate)) {
    return { error: m.propose.errorType };
  }

  let options: { date?: string; time?: string; game?: string }[] = [];

  if (type === "reschedule") {
    const dates = formData.getAll("option_date").map(String);
    const times = formData.getAll("option_time").map(String);
    options = dates
      .map((date, i) => ({ date: date.trim(), time: (times[i] ?? "").trim() }))
      .filter((o) => o.date || o.time);
    if (options.length === 0) return { error: m.propose.errorNoDate };
    if (options.some((o) => !isDate(o.date!) || !isTime(o.time!))) {
      return { error: m.propose.errorDateTime };
    }
    const keys = new Set(options.map((o) => `${o.date} ${o.time}`));
    if (keys.size !== options.length) return { error: m.propose.errorDuplicate };
  }

  if (type === "change_game") {
    options = formData
      .getAll("option_game")
      .map((g) => ({ game: String(g).trim() }))
      .filter((o) => o.game);
    if (options.length === 0) return { error: m.propose.errorNoGame };
    if (options.some((o) => o.game!.length > 120)) {
      return { error: m.propose.errorGameLong };
    }
  }

  if (options.length > 6) return { error: m.propose.errorMaxOptions };

  const reason = getString(formData, "reason");
  if (reason.length > 500) return { error: m.propose.errorMessageLong };

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
    return { error: await dbErrorMessage(error) };
  }

  afterMutation();
  // Si torna all'incontro (indietro nella cronologia, se si arriva da lì).
  return { redirectTo: `/groups/${groupId}/${originalDate}` };
}

export async function castVote(proposalId: string, optionIds: string[]): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cast_vote", {
    p_proposal_id: proposalId,
    p_option_ids: optionIds,
  });
  if (error) {
    console.error("cast_vote", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
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
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return {};
}

export async function cancelProposal(proposalId: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_proposal", { p_proposal_id: proposalId });
  if (error) {
    console.error("cancel_proposal", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return {};
}
