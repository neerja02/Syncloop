import type { ShellData } from "@/features/shell/types";

export const DEMO_PROFILE_ID = "profile-neerja";

/** Fictional demo family, in the shape the app shell expects (see src/features/shell/types.ts). */
export const SAMPLE_SHELL: ShellData = {
  user: { id: "user-1", fullName: "Neerja Jain", email: "demo@kinwell.health", isDemo: true, emailVerified: true, role: "PATIENT" },
  familyId: "family-1",
  familyName: "Jain family",
  profiles: [
    { id: DEMO_PROFILE_ID, display_name: "Neerja", relationship: "self", avatar_color: "#3D83DF", date_of_birth: "1988-04-12", has_photo: false },
    { id: "profile-mom", display_name: "Mom", relationship: "mother", avatar_color: "#BE185D", date_of_birth: "1961-08-03", has_photo: false },
    { id: "profile-dad", display_name: "Dad", relationship: "father", avatar_color: "#B45309", date_of_birth: "1958-01-21", has_photo: false },
    { id: "profile-bruno", display_name: "Bruno", relationship: "pet", avatar_color: "#0F766E", date_of_birth: "2021-06-15", has_photo: false },
  ],
  selectedProfileId: DEMO_PROFILE_ID,
  folders: [
    { id: "f1", name: "Blood Tests", icon: "flask", report_count: 4 },
    { id: "f2", name: "Prescriptions", icon: "pill", report_count: 1 },
  ],
  conversations: [
    { id: "c1", title: "Heel pain", active_profile_name: "Neerja", last_message_at: new Date().toISOString() },
    { id: "c2", title: "Mom's blood report", active_profile_name: "Mom", last_message_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  myDoctor: { name: "Dr. Amit Sharma (Demo)", specialisation: "General Physician", clinic_name: "Apollo Clinic", phone: "+91 98765 43210", address: "12 FC Road, Pune" },
  savedCity: "Pune",
  countryCode: "IN",
  isMockAI: true,
  prefs: { largeText: false, highContrast: false, reduceMotion: false },
};
