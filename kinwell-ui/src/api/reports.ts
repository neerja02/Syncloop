import { call, type ActionResult } from "./client";

/** `form` fields: file, profileId, folderId?, title?, purpose? */
export const uploadReportAction = (form: FormData) => call<ActionResult<{ reportId: string; profileId: string }>>("uploadReportAction", form);
export const listReportsForPickerAction = (profileId: string) =>
  call<ActionResult<{ id: string; title: string; date: string; folder: string | null; status: string }[]>>("listReportsForPickerAction", profileId);
export const createFolderAction = (familyId: string, name: string) => call<ActionResult<{ id: string }>>("createFolderAction", familyId, name);
export const renameFolderAction = (id: string, name: string) => call<ActionResult>("renameFolderAction", id, name);
export const deleteFolderAction = (id: string) => call<ActionResult>("deleteFolderAction", id);
export const confirmResultAction = (resultId: string) => call<ActionResult>("confirmResultAction", resultId);
export const enterResultAction = (resultId: string, value: string, unit?: string) => call<ActionResult>("enterResultAction", resultId, value, unit);
export const resolveMedicationResultAction = (resultId: string, decision: { action: "accept" | "choose" | "manual" | "reject"; name?: string }) =>
  call<ActionResult>("resolveMedicationResultAction", resultId, decision);
export const updateReportAction = (reportId: string, data: { title?: string; folderId?: string | null; profileId?: string; reportDate?: string | null }) =>
  call<ActionResult>("updateReportAction", reportId, data);
export const deleteReportAction = (reportId: string) => call<ActionResult>("deleteReportAction", reportId);
/** A short-lived URL to view or download the report file. */
export const reportFileUrlAction = (reportId: string, variant: "original" | "enhanced" = "original", download = false) =>
  call<ActionResult<{ url: string; mimeType: string; filename: string; familyId: string } | null>>("reportFileUrlAction", reportId, variant, download);
