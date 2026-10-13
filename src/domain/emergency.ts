import type { Contact, Profile } from "./types";

/** Emergency contacts for the SOS button, falling back to the family contact. */
export function sosContacts(pr: Profile): Contact[] {
  const list = (pr.sos ?? []).filter((c) => c.phone.trim());
  if (list.length) return list;
  return pr.cg.phone.trim() ? [pr.cg] : [];
}

/** "98722 11890" → "+919872211890". Ten-digit numbers are treated as Indian mobiles. */
export function e164(phone: string): string {
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.length === 10) return `+91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `+91${d.slice(1)}`;
  return `+${d}`;
}

export const telLink = (phone: string) => `tel:${e164(phone)}`;

export const whatsappLink = (phone: string, text: string) => `https://wa.me/${e164(phone).replace("+", "")}?text=${encodeURIComponent(text)}`;

export function sosMessage(pr: Profile, mapsUrl?: string) {
  return `🚨 EMERGENCY: ${pr.name || pr.first} ji pressed the SOS button in Sister Nia and needs help right now. Please call them immediately.${pr.phone ? ` Their phone: ${pr.phone}.` : ""}${mapsUrl ? ` Location: ${mapsUrl}` : ""}`;
}
