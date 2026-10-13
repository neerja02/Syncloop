import { beforeAll, describe, expect, it } from "vitest";
import { DOMAINS, REFERENCES } from "@/lib/clinical/knowledge/registry";
import { classifySymptom } from "@/lib/clinical/knowledge/classify";
import { syncKnowledge } from "@/lib/clinical/knowledge/sync";
import { COMPLAINT_LABEL } from "@/lib/ai/guided/symptom-engine";
import { REGION_IDS } from "@/lib/ai/guided/anatomy";
import { createConversation } from "@/lib/services/conversations";
import { handleUserMessage } from "@/lib/ai/orchestrator";
import type { ChatCard, QuestionCard } from "@/lib/ai/types";
import { count, createWorld, type TestWorld } from "./helpers";

describe("knowledge registry", () => {
  it("covers all 26 domains, numbered 1–26, each with symptoms, warning signs, specialties and references", () => {
    expect(DOMAINS.map((d) => d.number)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    for (const d of DOMAINS) {
      expect(d.symptoms.length, d.code).toBeGreaterThan(2);
      expect(d.warningSigns.length, d.code).toBeGreaterThan(1);
      expect(d.specialties.length, d.code).toBeGreaterThan(0);
      for (const r of d.references) expect(REFERENCES.map((x) => x.code)).toContain(r);
    }
  });
  it("every guided flow it points to exists", () => {
    const areas = new Set([...REGION_IDS, "back", "chest", "upper_abdomen", "lower_abdomen", "side", "arm", "leg", "joint"]);
    for (const s of DOMAINS.flatMap((d) => d.symptoms)) {
      if (!s.flow) continue;
      const [kind, detail] = s.flow.split(":");
      expect(Object.keys(COMPLAINT_LABEL), s.code).toContain(kind);
      if (kind === "pain") expect(areas.has(detail!), s.code).toBe(true);
    }
  });
  it("has unique symptom codes", () => {
    const codes = DOMAINS.flatMap((d) => d.symptoms.map((s) => s.code));
    expect(new Set(codes).size).toBe(codes.length);
  });
  it.each([
    ["I have yellow eyes", "jaundice", "liver"],
    ["Mujhe piliya hai", "jaundice", "liver"],
    ["My husband snores loudly", "snoring", "sleep"],
    ["Kharrate bahut aate hain", "snoring", "sleep"],
    ["I found a lump in my neck", "lump", "blood_immune"],
    ["I keep getting nosebleeds", "nosebleed", "ent"],
    ["Bachcha doodh nahi pee raha", "not_feeding", "children"],
  ])("classifies %s", (text, symptom, domain) => {
    expect(classifySymptom(text)).toMatchObject({ symptom: { code: symptom }, domain: { code: domain } });
  });
});

describe("knowledge tables", () => {
  let w: TestWorld;
  beforeAll(async () => {
    delete process.env.ENABLE_DOCTOR_PORTAL;
    w = await createWorld();
  });

  it("are synced with every domain and symptom, pending clinical review", async () => {
    expect(await count(w.db, "select count(*) as n from knowledge_domains")).toBe(26);
    expect(await count(w.db, "select count(*) as n from knowledge_symptoms")).toBe(DOMAINS.flatMap((d) => d.symptoms).length);
    expect(await count(w.db, "select count(*) as n from knowledge_symptoms where review_status <> 'pending_clinical_review'")).toBe(0);
  });
  it("sync is idempotent, and a change creates a new version with history", async () => {
    const before = await count(w.db, "select count(*) as n from knowledge_versions");
    await syncKnowledge(w.db);
    expect(await count(w.db, "select count(*) as n from knowledge_versions")).toBe(before);
    // Simulate an approved row whose content then changes in code.
    await w.db.query("update knowledge_domains set review_status = 'approved', reviewed_by = 'Dr. Reviewer', content_hash = 'stale' where code = 'heart'");
    await syncKnowledge(w.db);
    const row = (await w.db.query<{ version: number; review_status: string; reviewed_by: string | null }>("select version, review_status, reviewed_by from knowledge_domains where code = 'heart'")).rows[0]!;
    expect(row).toEqual({ version: 2, review_status: "pending_clinical_review", reviewed_by: null });
    expect(await count(w.db, "select count(*) as n from knowledge_versions where entity = 'domain' and code = 'heart'")).toBe(2);
  });

  describe("in conversation", () => {
    const question = (cards: ChatCard[]) => cards.find((c): c is QuestionCard => c.type === "question");
    const say = async (text: string) => {
      const conv = await createConversation(w.demo, w.profiles.me);
      return { conv, m: (await handleUserMessage(w.demo, conv, text)).assistantMessage };
    };

    it("a symptom without a step-by-step check gets general guidance, warning signs and the right specialist", async () => {
      const { m } = await say("I have yellow eyes since yesterday");
      expect(m.content).toMatch(/Jaundice relates to liver, gallbladder and pancreas/);
      expect(m.cards.find((c) => c.type === "care_level")).toMatchObject({ level: "clinician" });
      expect(m.cards.find((c) => c.type === "doctor_recommendation")).toMatchObject({ speciality: "Gastroenterologist" });
      const warn = m.cards.find((c) => c.type === "info" && c.title === "Get urgent help if you notice");
      expect(warn && warn.type === "info" && warn.body).toMatch(/Yellow eyes or skin with fever or confusion/);
    });
    it("a recognised symptom with a guided check starts it", async () => {
      const { m } = await say("I have dandruff and itchy scalp");
      expect(question(m.cards)?.key).toBe("hair_pattern");
    });
    it("records completed and escalated assessments in the audit log", async () => {
      const before = await count(w.db, "select count(*) as n from assessment_audit_log");
      await say("I have chest pressure and I'm sweating");
      const row = (await w.db.query<{ flow: string; care_level: string; engine_version: string }>("select flow, care_level, engine_version from assessment_audit_log order by created_at desc limit 1")).rows[0]!;
      expect(row).toMatchObject({ flow: "triage", care_level: "emergency" });
      expect(row.engine_version).toMatch(/^guided-/);
      const { conv } = await say("My calf is swollen after a long flight");
      const g = (await w.db.query<{ flow: string; care_level: string; conversation_id: string }>("select flow, care_level, conversation_id from assessment_audit_log order by created_at desc limit 1")).rows[0]!;
      expect(g).toMatchObject({ flow: "human", care_level: "same_day", conversation_id: conv });
      expect(await count(w.db, "select count(*) as n from assessment_audit_log")).toBe(before + 2);
    });
  });
});
