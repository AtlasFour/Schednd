"use client";

import { Field, Input, Select, Textarea } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import {
  APPROVAL_RULES,
  DURATION_MINUTES,
  GROUP_MODES,
  INTERVAL_WEEKS,
  type GroupRow,
} from "@/lib/groups";

const TIMEZONES = [
  "Europe/Rome",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

/** Campi del gruppo condivisi tra creazione e impostazioni. */
export function GroupInfoFields({ group }: { group?: Partial<GroupRow> }) {
  const { m } = useI18n();
  const timezone = group?.timezone ?? "Europe/Rome";
  const timezones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <>
      <Field label={m.groupForm.name} htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={group?.name ?? ""}
          placeholder={m.groupForm.namePlaceholder}
        />
      </Field>

      <Field label={m.groupForm.description} htmlFor="description" hint={m.common.optional}>
        <Textarea
          id="description"
          name="description"
          maxLength={1000}
          defaultValue={group?.description ?? ""}
          placeholder={m.groupForm.descriptionPlaceholder}
        />
      </Field>

      <Field
        label={m.groupForm.game}
        htmlFor="default_game_title"
        hint={m.groupForm.gameHint}
      >
        <Input
          id="default_game_title"
          name="default_game_title"
          maxLength={120}
          defaultValue={group?.default_game_title ?? ""}
          placeholder={m.groupForm.gamePlaceholder}
        />
      </Field>

      <Field label={m.groupForm.mode} htmlFor="mode">
        <Select id="mode" name="mode" defaultValue={group?.mode ?? "in_person"}>
          {GROUP_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {m.labels.mode[mode]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={m.groupForm.location}
        htmlFor="default_location"
        hint={m.groupForm.locationHint}
      >
        <Input
          id="default_location"
          name="default_location"
          maxLength={200}
          defaultValue={group?.default_location ?? ""}
          placeholder={m.groupForm.locationPlaceholder}
        />
      </Field>

      <Field label={m.groupForm.onlineLink} htmlFor="online_link" hint={m.groupForm.onlineLinkHint}>
        <Input
          id="online_link"
          name="online_link"
          type="url"
          maxLength={500}
          defaultValue={group?.online_link ?? ""}
          placeholder="https://"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={m.groupForm.duration} htmlFor="duration_minutes">
          <Select
            id="duration_minutes"
            name="duration_minutes"
            defaultValue={String(group?.duration_minutes ?? 180)}
          >
            {DURATION_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {m.labels.duration(minutes)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={m.groupForm.minAttendees} htmlFor="min_attendees">
          <Input
            id="min_attendees"
            name="min_attendees"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            defaultValue={group?.min_attendees ?? ""}
            placeholder={m.groupForm.minAttendeesPlaceholder}
          />
        </Field>
      </div>

      <Field
        label={m.groupForm.approvalRule}
        htmlFor="approval_rule"
        hint={
          <>
            {APPROVAL_RULES.map((rule) => (
              <span key={rule} className="block">
                <strong>{m.labels.approvalRule[rule].label}:</strong>{" "}
                {m.labels.approvalRule[rule].hint}
              </span>
            ))}
          </>
        }
      >
        <Select
          id="approval_rule"
          name="approval_rule"
          defaultValue={group?.approval_rule ?? "majority"}
        >
          {APPROVAL_RULES.map((rule) => (
            <option key={rule} value={rule}>
              {m.labels.approvalRule[rule].label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={m.groupForm.timezone} htmlFor="timezone">
        <Select id="timezone" name="timezone" defaultValue={timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

/** Campi della ricorrenza: primo incontro, frequenza, orario. */
export function ScheduleFields({
  anchorDate,
  intervalWeeks = 1,
  startTime = "21:00",
  minDate,
  dateLabel,
}: {
  anchorDate: string;
  intervalWeeks?: number;
  startTime?: string;
  minDate?: string;
  dateLabel?: string;
}) {
  const { m } = useI18n();
  return (
    <>
      <Field
        label={dateLabel ?? m.groupForm.firstMeeting}
        htmlFor="anchor_date"
        hint={m.groupForm.firstMeetingHint}
      >
        <Input
          id="anchor_date"
          name="anchor_date"
          type="date"
          required
          min={minDate}
          defaultValue={anchorDate}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={m.groupForm.frequency} htmlFor="interval_weeks">
          <Select
            id="interval_weeks"
            name="interval_weeks"
            defaultValue={String(intervalWeeks)}
          >
            {INTERVAL_WEEKS.map((weeks) => (
              <option key={weeks} value={weeks}>
                {m.labels.interval(weeks)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={m.groupForm.time} htmlFor="start_time">
          <Input
            id="start_time"
            name="start_time"
            type="time"
            required
            defaultValue={startTime.slice(0, 5)}
          />
        </Field>
      </div>
    </>
  );
}
