import { NextResponse, type NextRequest } from "next/server";
import { getI18n } from "@/i18n/server";
import { meetingToEvent } from "@/lib/calendar-events";
import { buildIcs } from "@/lib/ics";
import { getMeetingContext } from "@/lib/meeting-context";
import { meetingForDate, OCCURRENCE_SELECT, type OccurrenceRow } from "@/lib/meetings";
import { createClient } from "@/lib/supabase/server";

/** File .ics di un singolo incontro (per Apple Calendar, Outlook…). */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/groups/[id]/[date]/ics">,
) {
  const { id, date } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const ctx = await getMeetingContext(supabase, id, date, userId);
  if (!ctx) return new NextResponse("Not found", { status: 404 });

  const { data: occurrence } = await supabase
    .from("occurrences")
    .select(OCCURRENCE_SELECT)
    .eq("group_id", id)
    .eq("original_date", date)
    .maybeSingle();
  const meeting = meetingForDate(
    { ...ctx.group, memberCount: ctx.memberCount },
    date,
    (occurrence ?? undefined) as OccurrenceRow | undefined,
    userId,
  );
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const { m } = await getI18n();
  const event = meetingToEvent(ctx.group, meeting, request.nextUrl.origin, m, {
    guest: ctx.viewer === "guest",
  });
  return new NextResponse(buildIcs([event], ctx.group.name), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="schednd-${date}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
