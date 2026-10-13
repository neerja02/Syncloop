export interface ShellProfile {
  id: string;
  display_name: string;
  relationship: string;
  avatar_color: string;
  date_of_birth: string | null;
  has_photo: boolean;
}
export interface ShellFolder {
  id: string;
  name: string;
  icon: string;
  report_count: number;
}
export interface ShellConversation {
  id: string;
  title: string;
  active_profile_name: string;
  last_message_at: string;
}
/** The family's regular doctor (patient-maintained contact card). */
export interface ShellMyDoctor {
  name: string;
  specialisation: string | null;
  clinic_name: string | null;
  phone: string | null;
  address: string | null;
}
export interface ShellData {
  user: { id: string; fullName: string; email: string; isDemo: boolean; emailVerified: boolean; role: string };
  familyId: string;
  familyName: string;
  profiles: ShellProfile[];
  selectedProfileId: string;
  folders: ShellFolder[];
  conversations: ShellConversation[];
  myDoctor: ShellMyDoctor | null;
  savedCity: string | null;
  countryCode: string;
  isMockAI: boolean;
  prefs: { largeText: boolean; highContrast: boolean; reduceMotion: boolean };
}

/** Lets a dialog report back into the chat that opened it (e.g. "report uploaded"). */
/** `purpose` tells the chat whether a photo of a symptom (skin, injury, pet…) or a document was shared. */
export type ReportCallback = (report: { id: string; title: string; profileId: string; purpose?: string }) => void;

export type DialogRequest =
  | { kind: "upload"; profileId?: string; folderId?: string; purpose?: string; file?: File; onUploaded?: ReportCallback }
  | { kind: "camera"; profileId?: string; onUploaded?: ReportCallback }
  | { kind: "attach"; profileId: string; onUploaded?: ReportCallback; onPicked?: ReportCallback }
  | { kind: "pick_report"; profileId: string; onPicked: ReportCallback }
  | { kind: "my_doctor" }
  | { kind: "emergency" }
  | { kind: "reading"; profileId?: string; type?: string }
  | { kind: "folder" }
  | { kind: "profile"; relationship?: string };
