import { Field, Input, Select, Textarea } from "@/components/ui";
import {
  APPROVAL_RULE_LABELS,
  DURATION_OPTIONS,
  INTERVAL_OPTIONS,
  MODE_LABELS,
  type ApprovalRule,
  type GroupMode,
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
  const timezone = group?.timezone ?? "Europe/Rome";
  const timezones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <>
      <Field label="Nome del gruppo" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={group?.name ?? ""}
          placeholder="es. D&D del mercoledì"
        />
      </Field>

      <Field label="Descrizione" htmlFor="description" hint="Facoltativa.">
        <Textarea
          id="description"
          name="description"
          maxLength={1000}
          defaultValue={group?.description ?? ""}
          placeholder="es. Campagna di Curse of Strahd, livello 5"
        />
      </Field>

      <Field
        label="Gioco"
        htmlFor="default_game_title"
        hint="Il gioco abituale. Si potrà cambiare per un singolo incontro."
      >
        <Input
          id="default_game_title"
          name="default_game_title"
          maxLength={120}
          defaultValue={group?.default_game_title ?? ""}
          placeholder="es. D&D 5e, Gloomhaven, Among Us"
        />
      </Field>

      <Field label="Dove si gioca" htmlFor="mode">
        <Select id="mode" name="mode" defaultValue={group?.mode ?? "in_person"}>
          {(Object.keys(MODE_LABELS) as GroupMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Luogo"
        htmlFor="default_location"
        hint="Per gli incontri di persona. Potrà cambiare di volta in volta."
      >
        <Input
          id="default_location"
          name="default_location"
          maxLength={200}
          defaultValue={group?.default_location ?? ""}
          placeholder="es. Da Marco, via Roma 1"
        />
      </Field>

      <Field label="Link online" htmlFor="online_link" hint="Discord, Roll20, Foundry…">
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
        <Field label="Durata" htmlFor="duration_minutes">
          <Select
            id="duration_minutes"
            name="duration_minutes"
            defaultValue={String(group?.duration_minutes ?? 180)}
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Minimo presenti" htmlFor="min_attendees">
          <Input
            id="min_attendees"
            name="min_attendees"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            defaultValue={group?.min_attendees ?? ""}
            placeholder="nessuno"
          />
        </Field>
      </div>

      <Field
        label="Come si approvano le proposte"
        htmlFor="approval_rule"
        hint={
          <>
            {(Object.keys(APPROVAL_RULE_LABELS) as ApprovalRule[]).map((rule) => (
              <span key={rule} className="block">
                <strong>{APPROVAL_RULE_LABELS[rule].label}:</strong>{" "}
                {APPROVAL_RULE_LABELS[rule].hint}
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
          {(Object.keys(APPROVAL_RULE_LABELS) as ApprovalRule[]).map((rule) => (
            <option key={rule} value={rule}>
              {APPROVAL_RULE_LABELS[rule].label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Fuso orario" htmlFor="timezone">
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
  dateLabel = "Data del primo incontro",
}: {
  anchorDate: string;
  intervalWeeks?: number;
  startTime?: string;
  minDate?: string;
  dateLabel?: string;
}) {
  return (
    <>
      <Field
        label={dateLabel}
        htmlFor="anchor_date"
        hint="Il giorno della settimana viene preso da questa data."
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
        <Field label="Frequenza" htmlFor="interval_weeks">
          <Select
            id="interval_weeks"
            name="interval_weeks"
            defaultValue={String(intervalWeeks)}
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Orario" htmlFor="start_time">
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
