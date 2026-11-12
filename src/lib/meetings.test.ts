import { describe, expect, it } from "vitest";
import { upcomingMeetings, type MeetingGroup, type OccurrenceRow } from "./meetings";
import { addDays, todayInTimeZone } from "./schedule";

const today = todayInTimeZone("Europe/Rome");

const group: MeetingGroup = {
  id: "g1",
  name: "GROUPHAVEN",
  timezone: "Europe/Rome",
  default_game_title: "Gloomhaven",
  default_location: null,
  min_attendees: null,
  memberCount: 3,
  // Ogni settimana, con un incontro 3 giorni fa.
  group_schedules: [
    { id: "s1", anchor_date: addDays(today, -3), interval_weeks: 1, start_time: "21:00:00", valid_until: null },
  ],
};

const occurrence = (over: Partial<OccurrenceRow>): OccurrenceRow => ({
  id: "o1",
  group_id: "g1",
  original_date: addDays(today, -3),
  start_date: addDays(today, -3),
  start_time: "21:00:00",
  status: "scheduled",
  game_title_override: null,
  location_override: null,
  notes: null,
  attendances: [],
  ...over,
});

describe("upcomingMeetings", () => {
  it("elenca i prossimi incontri della ricorrenza", () => {
    const list = upcomingMeetings(group, [], "u1", 2);
    expect(list.map((m) => m.date)).toEqual([addDays(today, 4), addDays(today, 11)]);
  });

  it("mostra un incontro rinviato nella nuova data anche se l'originale è passata", () => {
    const moved = occurrence({ start_date: addDays(today, 2), start_time: "20:00:00" });
    const list = upcomingMeetings(group, [moved], "u1", 2);
    expect(list[0]).toMatchObject({ originalDate: addDays(today, -3), date: addDays(today, 2), startTime: "20:00:00" });
    expect(list[1].date).toBe(addDays(today, 4));
  });

  it("include gli incontri straordinari", () => {
    const extra = occurrence({
      id: "o2",
      original_date: addDays(today, 1),
      start_date: addDays(today, 1),
      is_extra: true,
    });
    expect(upcomingMeetings(group, [extra], "u1", 1)[0].date).toBe(addDays(today, 1));
  });
});
