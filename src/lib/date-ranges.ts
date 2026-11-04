import { addDays, startOfDay, startOfMonth, startOfWeek } from "date-fns";

export type Preset = "today" | "week" | "month" | "custom";

export interface Range {
  from: Date;
  to: Date; // exclusive
}

/** Ranges are in the browser's local time; `to` is exclusive. */
export function presetRange(preset: Exclude<Preset, "custom">, now = new Date()): Range {
  const tomorrow = addDays(startOfDay(now), 1);
  if (preset === "today") return { from: startOfDay(now), to: tomorrow };
  if (preset === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: tomorrow };
  return { from: startOfMonth(now), to: tomorrow };
}

/** Inclusive yyyy-mm-dd inputs → local range. */
export function customRange(fromStr: string, toStr: string): Range {
  const from = startOfDay(new Date(`${fromStr}T00:00:00`));
  const to = addDays(startOfDay(new Date(`${toStr}T00:00:00`)), 1);
  return { from, to };
}

export function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
