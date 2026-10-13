import "server-only";
import { getDb } from "@/lib/database/client";
import { labTestInfo, trendDirection } from "@/lib/clinical/report-extraction";
import { PatientContextService } from "../services/patient-context";
import { excerpt, retrieveDoctorKnowledge } from "../services/retrieval";
import { baseResponse, cardId, type AgentContext, type AgentResult } from "./context";
import type { ChatCard } from "../types";

const TEST_WORDS: [RegExp, string][] = [
  [/hba1c|a1c/i, "HbA1c"],
  [/ldl/i, "LDL cholesterol"],
  [/hdl/i, "HDL cholesterol"],
  [/cholesterol|lipid/i, "Total cholesterol"],
  [/triglycer/i, "Triglycerides"],
  [/creatinine|kidney/i, "Creatinine"],
  [/haemoglobin|hemoglobin|\bhb\b/i, "Haemoglobin"],
  [/tsh|thyroid/i, "TSH"],
  [/vitamin d/i, "Vitamin D"],
];

/** Medical Report Agent: explains stored reports, compares with history and surfaces doctor notes. */
export async function reportAgent(ctx: AgentContext): Promise<AgentResult> {
  const patient = new PatientContextService(ctx.profile.id, ctx.sources);
  const t = ctx.message;
  const testName = TEST_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
  const reports = await patient.recentReports(5);

  if (!reports.length) {
    return {
      agent: "ReportAgent",
      text: `There aren't any reports for ${ctx.profile.display_name} yet. Upload a PDF or photo and I'll organise it, read the values carefully and explain them.`,
      cards: [{ id: cardId(), type: "actions", actions: [{ label: "Upload report", kind: "upload_report", variant: "primary" }] }],
      response: baseResponse(ctx, { intent: "reports", summary: "No reports on file" }),
    };
  }

  const cards: ChatCard[] = [];
  const lines: string[] = [];
  const db = await getDb();

  if (testName) {
    const history = await patient.labHistory(testName, 6);
    const info = labTestInfo(testName);
    if (history.length) {
      const trend = trendDirection(testName, history.map((h) => h.value));
      lines.push(`${testName}: latest ${history[0]!.value}${history[0]!.unit === "%" ? "%" : " " + history[0]!.unit}${history[1] ? `, previously ${history[1].value}${history[1].unit === "%" ? "%" : ""}` : ""}${history[2] ? `, earlier ${history[2].value}${history[2].unit === "%" ? "%" : ""}` : ""}. ${trend.label}.`);
      if (info) lines.push(info.measures);
      cards.push({
        id: cardId(),
        type: "trend",
        measurementType: testName,
        label: `${testName} · ${ctx.profile.display_name}`,
        unit: history[0]!.unit,
        points: [...history].reverse().map((h) => ({ t: h.observed_at ?? new Date().toISOString(), v: h.value })),
        summary: trend.label,
      });
    } else {
      lines.push(`I couldn't find a confirmed ${testName} result for ${ctx.profile.display_name}.`);
    }
    // "What did the doctor say about my cholesterol?"
    const notes = (await db.query<{ title: string; doctor_notes: string; id: string }>(
      "select r.id, r.title, r.doctor_notes from reports r where r.profile_id = $1 and r.doctor_notes is not null and exists (select 1 from report_results rr where rr.report_id = r.id and rr.canonical_name = $2) order by r.created_at desc limit 2",
      [ctx.profile.id, testName],
    )).rows;
    const docNotes = (await patient.doctorNotes(10)).filter((n) => n.note.toLowerCase().includes(testName.split(" ")[0]!.toLowerCase()));
    const instructions = await patient.doctorInstructions([testName.toLowerCase()]);
    const knowledge = await retrieveDoctorKnowledge(ctx.doctor?.id ?? null, `${testName} result meaning target`, ctx.sources, { k: 2 });
    const items = [
      ...instructions.filter((i) => i.instruction.toLowerCase().includes(testName.split(" ")[0]!.toLowerCase())).map((i) => ({ kind: "instruction" as const, title: "Instruction", text: i.instruction, version: i.version })),
      ...notes.map((n) => ({ kind: "note" as const, title: `Doctor's note on ${n.title}`, text: n.doctor_notes })),
      ...docNotes.map((n) => ({ kind: "note" as const, title: `Note from ${n.doctor_name}`, text: n.note, date: new Date(n.created_at).toISOString() })),
      ...knowledge.map((k) => ({ kind: "knowledge" as const, title: k.title, text: excerpt(k, testName), documentId: k.document_id, version: k.version })),
    ];
    if (items.length) {
      cards.push({ id: cardId(), type: "doctor_guidance", doctorName: ctx.doctor?.name ?? "Your doctor", items });
      lines.push(/doctor (say|said)/i.test(t) ? `Here's what ${ctx.doctor?.name ?? "your doctor"} wrote about it.` : "Your doctor's notes on this are below.");
    } else if (/doctor (say|said)/i.test(t)) {
      lines.push(`I couldn't find a note from your doctor about ${testName}. Would you like to ask them?`);
    }
  } else {
    // "Analyse this blood report" → most recent report
    const r = reports[0]!;
    const results = (await db.query<{ canonical_name: string | null; test_name: string; value: number | null; value_text: string | null; unit: string | null; flag: string | null; status: string; field_type: string }>(
      "select canonical_name, test_name, value, value_text, unit, flag, status, field_type from report_results where report_id = $1 and field_type = 'lab_value' order by created_at",
      [r.id],
    )).rows;
    const prevMap = new Map<string, number>();
    for (const res of results) {
      if (!res.canonical_name) continue;
      const prev = (await db.query<{ value: number }>("select value from report_results where profile_id = $1 and canonical_name = $2 and report_id <> $3 and status = 'confirmed' and value is not null order by observed_at desc nulls last limit 1", [ctx.profile.id, res.canonical_name, r.id])).rows[0];
      if (prev) prevMap.set(res.canonical_name, prev.value);
    }
    cards.push({
      id: cardId(),
      type: "report_summary",
      reportId: r.id,
      title: r.title,
      status: r.status,
      date: r.report_date,
      highlights: results.map((x) => ({ name: x.canonical_name ?? x.test_name, value: x.value, valueText: x.value_text, unit: x.unit, flag: x.flag, status: x.status, previous: x.canonical_name ? prevMap.get(x.canonical_name) ?? null : null })),
    });
    lines.push(`Here's the most recent report for ${ctx.profile.display_name}: "${r.title}". ${r.summary ?? ""}`.trim());
    if (r.status === "needs_confirmation" || r.status === "unreadable") lines.push("Some values still need checking — I haven't guessed anything I couldn't read.");
    if (r.doctor_notes) lines.push(`Doctor's note: "${r.doctor_notes}"`);
  }
  cards.push({ id: cardId(), type: "actions", actions: [{ label: "Open reports", kind: "link", href: `/reports?profile=${ctx.profile.id}` }, { label: "Upload report", kind: "upload_report" }, { label: "Ask doctor", kind: "send_review" }] });
  return {
    agent: "ReportAgent",
    text: lines.join(" "),
    cards,
    state: { ...ctx.state, lastIntent: "reports" },
    response: baseResponse(ctx, { intent: "reports", summary: testName ? `${testName} history` : "Latest report summary", suggestedActions: ["open_report", "ask_doctor"] }),
  };
}
