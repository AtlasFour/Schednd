import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { meetingToEvent } from "@/lib/calendar-events";
import type { GroupRow, ScheduleRow } from "@/lib/groups";
import { buildIcs, type CalendarEvent } from "@/lib/ics";
import { fetchOccurrences, meetingsBetween, type MeetingGroup } from "@/lib/meetings";
import { addDays, todayInTimeZone } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

type MemberGroup = Pick<
  GroupRow,
  | "id"
  | "name"
  | "timezone"
  | "default_game_title"
  | "default_location"
  | "min_attendees"
  | "duration_minutes"
  | "online_link"
  | "kind"
> & { group_schedules: ScheduleRow[]; memberships: { count: number }[] };

type GuestRow = {
  occurrences: {
    original_date: string;
    start_date: string;
    start_time: string;
    status: "scheduled" | "skipped";
    game_title_override: string | null;
    location_override: string | null;
    notes: string | null;
    groups: Pick<
      GroupRow,
      "id" | "name" | "timezone" | "duration_minutes" | "online_link" | "default_game_title" | "default_location"
    > | null;
  } | null;
};

/**
 * Calendario personale (iCal) da abbonarsi in Google/Apple/Outlook.
 * Il link contiene un token segreto: i programmi di calendario non possono
 * fare login, quindi i dati si leggono con la chiave di servizio.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/calendar/[token]">) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{32,128}$/.test(token)) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("Calendar not configured", { status: 503 });

  const { data: userId } = await admin.rpc("calendar_user", { p_token: token });
  if (!userId) return new NextResponse("Not found", { status: 404 });

  const [{ data: profile }, { data: memberships }, { data: guestRows }] = await Promise.all([
    admin.from("profiles").select("locale").eq("id", userId).maybeSingle(),
    admin
      .from("memberships")
      .select(
        "groups(id, name, timezone, default_game_title, default_location, min_attendees, duration_minutes, online_link, kind, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until), memberships(count))",
      )
      .eq("user_id", userId),
    admin
      .from("occurrence_guests")
      .select(
        "occurrences(original_date, start_date, start_time, status, game_title_override, location_override, notes, groups(id, name, timezone, duration_minutes, online_link, default_game_title, default_location))",
      )
      .eq("user_id", userId),
  ]);

  const m = MESSAGES[isLocale(profile?.locale) ? profile.locale : "it"];
  const site = request.nextUrl.origin;
  const today = todayInTimeZone("Europe/Rome");
  const from = addDays(today, -30);
  const to = addDays(today, 180);

  const groups = ((memberships ?? []) as unknown as { groups: MemberGroup | null }[])
    .map((row) => row.groups)
    .filter((g): g is MemberGroup => g !== null);
  const occurrences = await fetchOccurrences(admin, groups.map((g) => g.id), addDays(from, -62));

  const events: CalendarEvent[] = [];
  for (const g of groups) {
    const group: MeetingGroup & MemberGroup = { ...g, memberCount: g.memberships[0]?.count ?? 1 };
    for (const meeting of meetingsBetween(group, occurrences, userId, from, to)) {
      events.push(meetingToEvent(g, meeting, site, m));
    }
  }
  for (const row of (guestRows ?? []) as unknown as GuestRow[]) {
    const o = row.occurrences;
    const g = o?.groups;
    if (!o || !g || o.start_date < from || o.start_date > to) continue;
    events.push(
      meetingToEvent(
        g,
        {
          originalDate: o.original_date,
          date: o.start_date,
          startTime: o.start_time,
          skipped: o.status === "skipped",
          game: o.game_title_override ?? g.default_game_title,
          location: o.location_override ?? g.default_location,
          notes: o.notes,
        },
        site,
        m,
        { guest: true },
      ),
    );
  }

  return new NextResponse(buildIcs(events, m.events.icsCalendarName), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
    },
  });
}
