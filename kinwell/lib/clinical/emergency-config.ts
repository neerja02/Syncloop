/**
 * Verified emergency numbers by country. These MUST come from this reviewed configuration — never from model output.
 * Review this file whenever adding a jurisdiction (source + verification date are required).
 */
export interface EmergencyConfig {
  countryCode: string;
  countryName: string;
  emergencyNumber: string;
  ambulanceNumber?: string;
  nonUrgentAdvice?: { label: string; number: string };
  crisisLine?: { label: string; number: string };
  poisonLine?: { label: string; number: string };
  source: string;
  verifiedAt: string;
}

export const EMERGENCY_CONFIG: Record<string, EmergencyConfig> = {
  IN: {
    countryCode: "IN",
    countryName: "India",
    emergencyNumber: "112",
    ambulanceNumber: "108",
    crisisLine: { label: "Tele-MANAS (mental health)", number: "14416" },
    source: "Government of India — Emergency Response Support System (112), National Ambulance Service (108), Tele-MANAS (14416)",
    verifiedAt: "2026-09",
  },
  US: {
    countryCode: "US",
    countryName: "United States",
    emergencyNumber: "911",
    crisisLine: { label: "988 Suicide & Crisis Lifeline", number: "988" },
    poisonLine: { label: "Poison Help", number: "1-800-222-1222" },
    source: "FCC (911), SAMHSA (988), HRSA Poison Help",
    verifiedAt: "2026-09",
  },
  GB: {
    countryCode: "GB",
    countryName: "United Kingdom",
    emergencyNumber: "999",
    nonUrgentAdvice: { label: "NHS 111", number: "111" },
    crisisLine: { label: "Samaritans", number: "116 123" },
    source: "NHS / Ofcom",
    verifiedAt: "2026-09",
  },
  AU: {
    countryCode: "AU",
    countryName: "Australia",
    emergencyNumber: "000",
    crisisLine: { label: "Lifeline", number: "13 11 14" },
    source: "Australian Government Triple Zero; Lifeline Australia",
    verifiedAt: "2026-09",
  },
  CA: {
    countryCode: "CA",
    countryName: "Canada",
    emergencyNumber: "911",
    crisisLine: { label: "9-8-8 Suicide Crisis Helpline", number: "988" },
    source: "CRTC (911); Public Health Agency of Canada (988)",
    verifiedAt: "2026-09",
  },
  EU: {
    countryCode: "EU",
    countryName: "European Union",
    emergencyNumber: "112",
    source: "European Commission — 112 single European emergency number",
    verifiedAt: "2026-09",
  },
};

export function getEmergencyConfig(countryCode: string | null | undefined): EmergencyConfig {
  return EMERGENCY_CONFIG[(countryCode ?? "").toUpperCase()] ?? EMERGENCY_CONFIG.EU!;
}

export const SUPPORTED_COUNTRIES = Object.values(EMERGENCY_CONFIG).map((c) => ({ code: c.countryCode, name: c.countryName }));
