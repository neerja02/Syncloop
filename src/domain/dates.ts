/** All dates in the app are "day offsets" from the base date (the day the demo started). */
export function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateOf(base: string, day: number): Date {
  const b = parseISO(base);
  return new Date(b.getFullYear(), b.getMonth(), b.getDate() + day);
}

export function isoPlus(base: string, days: number): string {
  return toISO(dateOf(base, days));
}

export const dayLabel = (base: string, day: number) =>
  dateOf(base, day).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

export const shortDate = (base: string, day: number) =>
  dateOf(base, day).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const prettyISO = (iso: string) =>
  iso ? parseISO(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "";

export function daysBetween(base: string, day: number, iso: string): number {
  return Math.round((parseISO(iso).getTime() - dateOf(base, day).getTime()) / 864e5);
}
