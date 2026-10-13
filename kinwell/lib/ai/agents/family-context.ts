import type { Profile, Relationship } from "@/types/domain";

/**
 * Family Context Agent: works out who a message is about.
 * It never switches silently — the orchestrator asks for confirmation whenever the subject seems to differ
 * from the conversation's active profile.
 */
const RELATION_WORDS: { re: RegExp; relationship: Relationship }[] = [
  { re: /\b(my\s+)?(mother|mom|mum|mommy|mummy|mama|maa|amma)\b/i, relationship: "mother" },
  { re: /\b(my\s+)?(father|dad|daddy|papa|pappa|baba|appa)\b/i, relationship: "father" },
  { re: /\b(my\s+)?(wife|husband|spouse|partner)\b/i, relationship: "spouse" },
  { re: /\b(my\s+)?(son|daughter|child|kid|baby|toddler)\b/i, relationship: "child" },
  { re: /\b(my\s+)?(grandma|grandpa|grandmother|grandfather|nani|nana|dadi|dada|granny)\b/i, relationship: "grandparent" },
  { re: /\b(my\s+)?(brother|sister|sibling)\b/i, relationship: "sibling" },
];

export interface ProfileDetection {
  mentionedProfileId: string | null;
  mentionedName: string | null;
  confidence: number;
  /** Relationship mentioned but no matching profile exists (offer to add one). */
  missingRelationship: Relationship | null;
  candidates: { id: string; name: string }[];
  subjectChanged: boolean;
}

export function detectProfileMention(message: string, profiles: Profile[], activeProfileId: string): ProfileDetection {
  const text = message.toLowerCase();
  const none: ProfileDetection = { mentionedProfileId: null, mentionedName: null, confidence: 0, missingRelationship: null, candidates: [], subjectChanged: false };

  // 1) Explicit names ("Asha has a fever") — strongest signal. Ignore the signed-in user's own name.
  const nameHits = profiles
    .map((p) => {
      const first = p.display_name.split(/\s+/)[0]!.toLowerCase();
      if (first.length < 3) return null;
      const re = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}('s)?\\b`, "i");
      const m = re.exec(text);
      return m ? { p, idx: m.index } : null;
    })
    .filter((x): x is { p: Profile; idx: number } => !!x);

  // 2) Relationship words ("my mother", "dad").
  const relHits = RELATION_WORDS.map((r) => {
    const m = r.re.exec(message);
    return m ? { relationship: r.relationship, idx: m.index, explicitMy: !!m[1] } : null;
  }).filter((x): x is { relationship: Relationship; idx: number; explicitMy: boolean } => !!x);

  type Hit = { idx: number; ids: string[]; names: string[]; confidence: number; relationship?: Relationship };
  const hits: Hit[] = [];
  for (const n of nameHits) hits.push({ idx: n.idx, ids: [n.p.id], names: [n.p.display_name], confidence: 0.95 });
  for (const r of relHits) {
    const matches = profiles.filter((p) => p.relationship === r.relationship || p.display_name.toLowerCase() === r.relationship);
    hits.push({ idx: r.idx, ids: matches.map((m) => m.id), names: matches.map((m) => m.display_name), confidence: matches.length === 1 ? (r.explicitMy ? 0.88 : 0.75) : 0.5, relationship: r.relationship });
  }
  if (!hits.length) return none;

  // When several people are mentioned, the *last* subject mentioned usually carries the new topic:
  // "I feel better now, but my mother has a headache" → mother.
  hits.sort((a, b) => b.idx - a.idx);
  const top = hits[0]!;
  if (!top.ids.length) return { ...none, missingRelationship: top.relationship ?? null };
  if (top.ids.length > 1) {
    return { ...none, candidates: top.ids.map((id, i) => ({ id, name: top.names[i]! })), confidence: 0.5, subjectChanged: !top.ids.includes(activeProfileId) };
  }
  const id = top.ids[0]!;
  const p = profiles.find((x) => x.id === id)!;
  return { mentionedProfileId: id, mentionedName: p.display_name, confidence: top.confidence, missingRelationship: null, candidates: [{ id, name: p.display_name }], subjectChanged: id !== activeProfileId };
}
