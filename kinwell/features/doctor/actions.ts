"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import { addDoctorNote, addInstruction, deactivateInstruction, markReportReviewed, sendMessage, updateDoctorProfile } from "@/lib/services/doctor";
import { deleteKnowledgeDocument, searchDoctorKnowledge, setKnowledgeStatus, uploadKnowledgeDocument } from "@/lib/services/knowledge";
import { updateAppointment } from "@/lib/services/appointments";
import { assertDoctor } from "@/lib/security/access";

const refresh = () => revalidatePath("/doctor", "layout");

export async function addInstructionAction(input: unknown, supersedesId?: string | null) {
  return run(async (actor) => {
    await addInstruction(actor, input, supersedesId);
    refresh();
  });
}
export async function deactivateInstructionAction(id: string) {
  return run(async (actor) => {
    await deactivateInstruction(actor, id);
    refresh();
  });
}
export async function addDoctorNoteAction(profileId: string, note: string) {
  return run(async (actor) => {
    await addDoctorNote(actor, profileId, note);
    refresh();
  });
}
export async function markReportReviewedAction(reportId: string, notes: string | null) {
  return run(async (actor) => {
    await markReportReviewed(actor, reportId, notes);
    refresh();
  });
}
export async function doctorSendMessageAction(familyId: string, body: string) {
  return run(async (actor) => {
    await sendMessage(actor, familyId, body);
    refresh();
  });
}
export async function uploadKnowledgeAction(form: FormData) {
  return run(async (actor) => {
    const file = form.get("file");
    const id = await uploadKnowledgeDocument(actor, {
      title: String(form.get("title") ?? ""),
      category: String(form.get("category") ?? ""),
      source: (form.get("source") as string) || null,
      text: (form.get("text") as string) || undefined,
      replacesId: (form.get("replacesId") as string) || null,
      file: file instanceof File && file.size > 0 ? { name: file.name, type: file.type, buffer: Buffer.from(await file.arrayBuffer()) } : undefined,
    });
    refresh();
    return { id };
  });
}
export async function knowledgeStatusAction(id: string, action: "approve" | "deactivate" | "archive" | "reactivate") {
  return run(async (actor) => {
    await setKnowledgeStatus(actor, id, action);
    refresh();
  });
}
export async function deleteKnowledgeAction(id: string) {
  return run(async (actor) => {
    await deleteKnowledgeDocument(actor, id);
    refresh();
  });
}
export async function testKnowledgeSearchAction(query: string) {
  return run(async (actor) => {
    assertDoctor(actor);
    return searchDoctorKnowledge(actor.doctorId, query.slice(0, 300), { k: 5 });
  });
}
export async function doctorAppointmentAction(id: string, status: "confirmed" | "completed" | "cancelled") {
  return run(async (actor) => {
    await updateAppointment(actor, id, { status });
    refresh();
  });
}
export async function updateDoctorProfileAction(input: { speciality?: string; clinic_name?: string; clinic_address?: string; bio?: string; contact_hours?: string; accepting_reviews?: boolean; languages?: string[]; consultation_types?: string[] }) {
  return run(async (actor) => {
    await updateDoctorProfile(actor, input);
    refresh();
  });
}
