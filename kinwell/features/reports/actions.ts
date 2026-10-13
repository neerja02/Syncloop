"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import { confirmResult, createFolder, deleteFolder, deleteReport, enterResultManually, listReports, renameFolder, resolveMedicationResult, signedFileUrl, updateReportMeta, uploadReport } from "@/lib/services/reports";
import { assertProfileAccess } from "@/lib/security/access";
import { fileMetaSchema } from "@/lib/validation/health";
import { z } from "zod";

const refresh = () => revalidatePath("/", "layout");

export async function uploadReportAction(form: FormData) {
  return run(async (actor) => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
    fileMetaSchema.parse({ name: file.name, type: file.type, size: file.size });
    const profileId = z.string().uuid("Choose who this report belongs to.").parse(form.get("profileId"));
    const folderId = (form.get("folderId") as string) || null;
    const id = await uploadReport(actor, {
      profileId,
      folderId,
      title: (form.get("title") as string) || null,
      purpose: (form.get("purpose") as string) || null,
      file: { name: file.name, type: file.type, size: file.size, buffer: Buffer.from(await file.arrayBuffer()) },
    });
    refresh();
    return { reportId: id, profileId };
  });
}

/** Recent reports for one person, for the "Choose from Reports" sheet in chat. */
export async function listReportsForPickerAction(profileId: string) {
  return run(async (actor) => {
    const ref = await assertProfileAccess(actor, profileId);
    const rows = await listReports(actor, ref.family_id, { profileId, limit: 30 });
    return rows.map((r) => ({ id: r.id, title: r.title, date: r.report_date ? String(r.report_date).slice(0, 10) : new Date(r.created_at).toISOString().slice(0, 10), folder: r.folder_name ?? null, status: r.status }));
  });
}

export async function createFolderAction(familyId: string, name: string) {
  return run(async (actor) => {
    const f = await createFolder(actor, familyId, name);
    refresh();
    return { id: f.id };
  });
}
export async function renameFolderAction(id: string, name: string) {
  return run(async (actor) => {
    await renameFolder(actor, id, name);
    refresh();
  });
}
export async function deleteFolderAction(id: string) {
  return run(async (actor) => {
    await deleteFolder(actor, id);
    refresh();
  });
}
export async function confirmResultAction(resultId: string) {
  return run(async (actor) => {
    await confirmResult(actor, resultId);
    refresh();
  });
}
export async function enterResultAction(resultId: string, value: string, unit?: string) {
  return run(async (actor) => {
    const n = Number(String(value).replace(",", "."));
    if (!Number.isFinite(n)) throw new Error("Enter a number exactly as printed on the report.");
    await enterResultManually(actor, resultId, n, unit);
    refresh();
  });
}
export async function resolveMedicationResultAction(resultId: string, decision: { action: "accept" | "choose" | "manual" | "reject"; name?: string }) {
  return run(async (actor) => {
    await resolveMedicationResult(actor, resultId, decision);
    refresh();
  });
}
export async function updateReportAction(reportId: string, data: { title?: string; folderId?: string | null; profileId?: string; reportDate?: string | null }) {
  return run(async (actor) => {
    await updateReportMeta(actor, reportId, data);
    refresh();
  });
}
export async function deleteReportAction(reportId: string) {
  return run(async (actor) => {
    await deleteReport(actor, reportId);
    refresh();
  });
}
export async function reportFileUrlAction(reportId: string, variant: "original" | "enhanced" = "original", download = false) {
  return run(async (actor) => signedFileUrl(actor, reportId, variant, download));
}
