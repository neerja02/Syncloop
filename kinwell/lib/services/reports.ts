import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/database/client";
import { assertFamilyAccess, assertProfileAccess, ForbiddenError, logAccess, NotFoundError } from "@/lib/security/access";
import { getStorage } from "@/lib/integrations/storage";
import { getDocumentRecognition } from "@/lib/integrations/ocr";
import { getMedicationTerminology } from "@/lib/integrations/terminology/medication";
import { enhanceForReading, makeThumbnail } from "@/lib/services/image-processing";
import { extractStructuredFields, labTestInfo, trendDirection } from "@/lib/clinical/report-extraction";
import { MAX_REPORT_BYTES, sniffMime } from "@/lib/validation/health";
import { sha256 } from "@/lib/security/crypto";
import { notifyFamily } from "./notifications";
import type { Actor } from "@/types/domain";

export interface ReportFolder {
  id: string;
  family_id: string;
  name: string;
  icon: string;
  is_default: boolean;
  report_count?: number;
}

export interface ReportRow {
  id: string;
  family_id: string;
  profile_id: string;
  profile_name: string;
  folder_id: string | null;
  folder_name: string | null;
  title: string;
  document_type: string;
  report_date: string | null;
  doctor_name: string | null;
  lab_name: string | null;
  status: string;
  quality: { score: number; readable: boolean; issues: string[] } | null;
  summary: string | null;
  extraction: { provider?: string; isMock?: boolean; documentType?: { type: string; confidence: number }; reportDate?: { value: string | null; confidence: number }; enhancement?: string[]; errors?: string[] } | null;
  provider: string | null;
  doctor_reviewed_at: Date | null;
  doctor_notes: string | null;
  created_at: Date;
  has_thumbnail?: boolean;
}

export interface ReportResult {
  id: string;
  report_id: string;
  test_name: string;
  canonical_name: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  confidence: number;
  page_number: number | null;
  raw_text: string | null;
  normalised_text: string | null;
  field_type: string;
  status: string;
  observed_at: string | null;
}

const REPORT_SELECT = `select r.id, r.family_id, r.profile_id, p.display_name as profile_name, r.folder_id, f.name as folder_name, r.title, r.document_type,
  r.report_date, r.doctor_name, r.lab_name, r.status, r.quality, r.summary, r.extraction, r.provider, r.doctor_reviewed_at, r.doctor_notes, r.created_at,
  exists(select 1 from report_files rf where rf.report_id = r.id and rf.variant = 'thumbnail') as has_thumbnail
  from reports r join profiles p on p.id = r.profile_id left join report_folders f on f.id = r.folder_id`;

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------
export async function listFolders(actor: Actor, familyId: string): Promise<ReportFolder[]> {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  return (
    await db.query<ReportFolder>(
      `select f.*, (select count(*) from reports r where r.folder_id = f.id) as report_count from report_folders f where f.family_id = $1 order by f.is_default desc, f.name`,
      [familyId],
    )
  ).rows;
}

export async function createFolder(actor: Actor, familyId: string, name: string) {
  await assertFamilyAccess(actor, familyId, "write");
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 1 || clean.length > 60) throw new Error("Folder names must be 1–60 characters.");
  const db = await getDb();
  const exists = await db.query("select 1 from report_folders where family_id = $1 and lower(name) = lower($2)", [familyId, clean]);
  if (exists.rows.length) throw new Error("A folder with that name already exists.");
  const { rows } = await db.query<ReportFolder>("insert into report_folders(family_id, name, created_by) values ($1,$2,$3) returning *", [familyId, clean, actor.id]);
  return rows[0]!;
}

export async function renameFolder(actor: Actor, folderId: string, name: string) {
  const db = await getDb();
  const f = (await db.query<ReportFolder>("select * from report_folders where id = $1", [folderId])).rows[0];
  if (!f) throw new NotFoundError();
  await assertFamilyAccess(actor, f.family_id, "write");
  await db.query("update report_folders set name = $2 where id = $1", [folderId, name.trim().slice(0, 60)]);
}

export async function deleteFolder(actor: Actor, folderId: string) {
  const db = await getDb();
  const f = (await db.query<ReportFolder>("select * from report_folders where id = $1", [folderId])).rows[0];
  if (!f) throw new NotFoundError();
  await assertFamilyAccess(actor, f.family_id, "write");
  await db.query("delete from report_folders where id = $1", [folderId]); // reports keep existing with folder_id = null
}

export async function getFolder(actor: Actor, folderId: string) {
  const db = await getDb();
  const f = (await db.query<ReportFolder>("select * from report_folders where id = $1", [folderId])).rows[0];
  if (!f) throw new NotFoundError("Folder not found");
  await assertFamilyAccess(actor, f.family_id);
  return f;
}

// ---------------------------------------------------------------------------
// Listing & detail
// ---------------------------------------------------------------------------
export async function listReports(actor: Actor, familyId: string, filters: { profileId?: string; folderId?: string; q?: string; type?: string; status?: string; limit?: number } = {}) {
  await assertFamilyAccess(actor, familyId);
  const db = await getDb();
  const args: unknown[] = [familyId];
  const where = ["r.family_id = $1"];
  if (filters.profileId) {
    args.push(filters.profileId);
    where.push(`r.profile_id = $${args.length}`);
  }
  if (filters.folderId) {
    args.push(filters.folderId);
    where.push(`r.folder_id = $${args.length}`);
  }
  if (filters.type) {
    args.push(filters.type);
    where.push(`r.document_type = $${args.length}`);
  }
  if (filters.status) {
    args.push(filters.status);
    where.push(`r.status = $${args.length}`);
  }
  if (filters.q) {
    args.push(filters.q);
    args.push(`%${filters.q}%`);
    where.push(`(r.search @@ plainto_tsquery('english', $${args.length - 1}) or r.title ilike $${args.length})`);
  }
  args.push(filters.limit ?? 200);
  return (await db.query<ReportRow>(`${REPORT_SELECT} where ${where.join(" and ")} order by coalesce(r.report_date, r.created_at::date) desc, r.created_at desc limit $${args.length}`, args)).rows;
}

export async function getReport(actor: Actor, reportId: string) {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) throw new NotFoundError("Report not found");
  const report = (await db.query<ReportRow>(`${REPORT_SELECT} where r.id = $1`, [reportId])).rows[0];
  if (!report) throw new NotFoundError("Report not found");
  await assertFamilyAccess(actor, report.family_id);
  await logAccess(actor, "view", "report", reportId, report.family_id);
  const results = (await db.query<ReportResult>("select * from report_results where report_id = $1 order by field_type, created_at", [reportId])).rows;
  const files = (await db.query<{ id: string; storage_key: string; original_filename: string; mime_type: string; size_bytes: number; variant: string }>("select * from report_files where report_id = $1 order by variant", [reportId])).rows;
  return { report, results, files };
}

/** History for each test name in this report — powers "Latest / Previous / Earlier" comparisons. */
export async function resultHistory(actor: Actor, profileId: string, canonicalNames: string[]) {
  await assertProfileAccess(actor, profileId);
  if (!canonicalNames.length) return {};
  const db = await getDb();
  const { rows } = await db.query<{ canonical_name: string; value: number; unit: string; observed_at: string; report_id: string }>(
    `select canonical_name, value, unit, coalesce(observed_at, created_at::date) as observed_at, report_id from report_results
     where profile_id = $1 and canonical_name = any($2::text[]) and value is not null and status = 'confirmed'
     order by coalesce(observed_at, created_at::date) desc`,
    [profileId, canonicalNames],
  );
  const out: Record<string, { value: number; unit: string; observed_at: string; report_id: string }[]> = {};
  for (const r of rows) (out[r.canonical_name] ??= []).push(r);
  return out;
}

export async function signedFileUrl(actor: Actor, reportId: string, variant: "original" | "enhanced" | "thumbnail" = "original", download = false) {
  const { report, files } = await getReport(actor, reportId);
  const f = files.find((x) => x.variant === variant) ?? (variant !== "original" ? null : files[0]);
  if (!f) return null;
  return { url: await getStorage().signedUrl(f.storage_key, { userId: actor.id, ttlSeconds: 300, download }), mimeType: f.mime_type, filename: f.original_filename, familyId: report.family_id };
}

/** Called by /api/files: verifies the key belongs to a report/knowledge doc the user may access. */
export async function authoriseFileKey(actor: Actor, key: string) {
  const db = await getDb();
  const rf = (await db.query<{ family_id: string; mime_type: string; original_filename: string }>(
    "select r.family_id, f.mime_type, f.original_filename from report_files f join reports r on r.id = f.report_id where f.storage_key = $1",
    [key],
  )).rows[0];
  if (rf) {
    await assertFamilyAccess(actor, rf.family_id);
    return { mimeType: rf.mime_type, filename: rf.original_filename };
  }
  const kd = (await db.query<{ doctor_id: string; mime_type: string; title: string }>("select doctor_id, mime_type, title from knowledge_documents where original_file_url = $1", [key])).rows[0];
  if (kd && actor.doctorId === kd.doctor_id) return { mimeType: kd.mime_type ?? "application/octet-stream", filename: kd.title };
  throw new ForbiddenError();
}

// ---------------------------------------------------------------------------
// Upload & processing pipeline
// ---------------------------------------------------------------------------
export interface UploadInput {
  profileId: string;
  folderId?: string | null;
  title?: string | null;
  file: { name: string; type: string; size: number; buffer: Buffer };
  purpose?: string | null;
}

/**
 * Report pipeline:
 *  1. validate + store original privately   2. associate profile/folder   3. quality assessment
 *  4. detect document type   5. extract text   6. extract structured values   7. terminology matching
 *  8. medication normalisation   9. confidence per field   10. store raw extraction   11. friendly summary
 *  12. compare with history   13. store confirmed values as trends   14. available for doctor review
 */
export async function uploadReport(actor: Actor, input: UploadInput) {
  const ref = await assertProfileAccess(actor, input.profileId, "write");
  if (input.file.size > MAX_REPORT_BYTES) throw new Error("Files must be 15 MB or smaller.");
  const mime = sniffMime(input.file.buffer, input.file.type, input.file.name);
  if (!mime) throw new Error("Unsupported file. Please upload a PDF, JPG, PNG, HEIC or TXT file.");
  const db = await getDb();
  if (input.folderId) {
    const f = (await db.query<{ family_id: string }>("select family_id from report_folders where id = $1", [input.folderId])).rows[0];
    if (!f || f.family_id !== ref.family_id) throw new Error("Folder not found");
  }
  const reportId = randomUUID();
  const storage = getStorage();
  const ext = input.file.name.includes(".") ? input.file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  const originalKey = `families/${ref.family_id}/reports/${reportId}/original.${ext}`;
  await storage.put(originalKey, input.file.buffer, mime);
  const title = (input.title?.trim() || input.file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")).slice(0, 120);
  await db.transaction(async (tx) => {
    await tx.query(
      "insert into reports(id, family_id, profile_id, folder_id, title, status, uploaded_by) values ($1,$2,$3,$4,$5,'processing',$6)",
      [reportId, ref.family_id, input.profileId, input.folderId ?? null, title, actor.id],
    );
    await tx.query("insert into report_files(report_id, storage_key, original_filename, mime_type, size_bytes, sha256, variant) values ($1,$2,$3,$4,$5,$6,'original')", [
      reportId,
      originalKey,
      input.file.name.slice(0, 200),
      mime,
      input.file.size,
      sha256(input.file.buffer),
    ]);
  });
  await logAccess(actor, "upload", "report", reportId, ref.family_id);
  await processReport(reportId, input.file.buffer, mime, input.file.name);
  return reportId;
}

export async function processReport(reportId: string, buffer: Buffer, mime: string, filename: string) {
  const db = await getDb();
  const report = (await db.query<{ family_id: string; profile_id: string; folder_id: string | null; title: string }>("select family_id, profile_id, folder_id, title from reports where id = $1", [reportId])).rows[0]!;
  const storage = getStorage();
  const errors: string[] = [];
  let enhancementSteps: string[] = [];
  try {
    if (mime.startsWith("image/")) {
      const enhanced = await enhanceForReading(buffer);
      if (enhanced) {
        const key = `families/${report.family_id}/reports/${reportId}/enhanced.jpg`;
        await storage.put(key, enhanced.buffer, enhanced.mimeType);
        await db.query("insert into report_files(report_id, storage_key, original_filename, mime_type, size_bytes, sha256, variant) values ($1,$2,$3,$4,$5,$6,'enhanced')", [reportId, key, `enhanced-${filename}.jpg`, enhanced.mimeType, enhanced.buffer.length, sha256(enhanced.buffer)]);
        enhancementSteps = enhanced.steps;
      }
      const thumb = await makeThumbnail(buffer);
      if (thumb) {
        const key = `families/${report.family_id}/reports/${reportId}/thumbnail.jpg`;
        await storage.put(key, thumb, "image/jpeg");
        await db.query("insert into report_files(report_id, storage_key, original_filename, mime_type, size_bytes, sha256, variant) values ($1,$2,$3,'image/jpeg',$4,$5,'thumbnail')", [reportId, key, `thumb-${filename}.jpg`, thumb.length, sha256(thumb)]);
      }
    }

    const recognition = await getDocumentRecognition().recognize({ buffer, mimeType: mime, filename });
    const extraction = await extractStructuredFields(recognition.lines, getMedicationTerminology());
    const reportDate = extraction.reportDate.confidence >= 0.6 ? extraction.reportDate.value : null;

    await db.query("delete from report_results where report_id = $1", [reportId]);
    for (const f of extraction.fields) {
      await db.query(
        `insert into report_results(report_id, profile_id, test_name, canonical_name, value, value_text, unit, reference_range, flag, confidence, page_number,
          bounding_box, raw_text, normalised_text, field_type, status, observed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17)`,
        [reportId, report.profile_id, f.test_name, f.canonical_name, f.value, f.value_text, f.unit, f.reference_range, f.flag, f.confidence, f.page_number, f.bounding_box ? JSON.stringify(f.bounding_box) : null, f.raw_text, f.normalised_text, f.field_type, f.status, reportDate],
      );
    }

    // Auto-file into a matching default folder when the user didn't choose one.
    let folderId = report.folder_id;
    if (!folderId) {
      const folderName = { blood_test: "Blood Tests", prescription: "Prescriptions", imaging: "Imaging" }[extraction.documentType.type];
      const hasHba1c = extraction.fields.some((f) => f.canonical_name === "HbA1c");
      // Prefer a family's own "Diabetes" folder for HbA1c reports, then the type folder, then "General Reports".
      const candidates = [hasHba1c ? "Diabetes" : null, extraction.documentType.confidence >= 0.6 ? folderName : null, "General Reports"].filter((x): x is string => !!x);
      const rows = (await db.query<{ id: string; name: string }>("select id, name from report_folders where family_id = $1 and name = any($2::text[])", [report.family_id, candidates])).rows;
      folderId = candidates.map((c) => rows.find((r) => r.name === c)?.id).find(Boolean) ?? null;
    }

    const unreadable = !recognition.quality.readable && extraction.fields.every((f) => f.status !== "confirmed");
    const status = unreadable ? "unreadable" : extraction.unreadableCount || extraction.needsConfirmationCount ? "needs_confirmation" : extraction.fields.length || recognition.text.length > 20 ? "processed" : "unreadable";
    const summary = await buildSummary(reportId, report.profile_id, extraction, reportDate);
    await db.query(
      `update reports set status=$2, document_type=$3, report_date=$4, lab_name=$5, quality=$6::jsonb, raw_text=$7, extraction=$8::jsonb, provider=$9, summary=$10, folder_id=$11, updated_at=now() where id=$1`,
      [
        reportId,
        status,
        ["blood_test", "prescription", "imaging", "discharge_summary"].includes(extraction.documentType.type) ? extraction.documentType.type : "other",
        reportDate,
        extraction.labName,
        JSON.stringify(recognition.quality),
        recognition.text.slice(0, 50000),
        JSON.stringify({ provider: recognition.provider, isMock: recognition.isMock, documentType: extraction.documentType, reportDate: extraction.reportDate, enhancement: enhancementSteps, errors, lineCount: recognition.lines.length }),
        recognition.provider,
        summary,
        folderId,
      ],
    );
    await syncConfirmedMeasurements(reportId);
    await notifyFamily(report.family_id, {
      kind: "report_processed",
      profileId: report.profile_id,
      title: status === "processed" ? "Report ready" : status === "unreadable" ? "We couldn't read a report" : "Please confirm a few values",
      body: status === "processed" ? `"${report.title}" has been organised and summarised.` : status === "unreadable" ? `"${report.title}" was hard to read. You can upload a clearer copy.` : `Some values in "${report.title}" need your confirmation.`,
      link: `/reports/${reportId}`,
    });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Processing failed");
    await db.query("update reports set status='failed', extraction=$2::jsonb, updated_at=now() where id=$1", [reportId, JSON.stringify({ errors })]);
  }
}

async function buildSummary(reportId: string, profileId: string, extraction: Awaited<ReturnType<typeof extractStructuredFields>>, reportDate: string | null) {
  const db = await getDb();
  const labs = extraction.fields.filter((f) => f.field_type === "lab_value");
  const meds = extraction.fields.filter((f) => f.field_type === "medication");
  const parts: string[] = [];
  if (labs.length) {
    const outside = labs.filter((f) => f.flag === "high" || f.flag === "low");
    parts.push(`This report includes ${labs.length} test result${labs.length === 1 ? "" : "s"}${reportDate ? ` from ${new Date(reportDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.`);
    if (outside.length) parts.push(`${outside.length} ${outside.length === 1 ? "is" : "are"} outside the reference range printed on the report (${outside.map((f) => f.canonical_name).join(", ")}). That's worth discussing with your doctor, but on its own it isn't a diagnosis.`);
    else if (labs.every((f) => f.flag === "normal")) parts.push("All readable values are within the reference ranges printed on the report.");
    const hba1c = labs.find((f) => f.canonical_name === "HbA1c" && f.value != null);
    if (hba1c) {
      const prev = (await db.query<{ value: number }>("select value from report_results where profile_id = $1 and report_id <> $2 and canonical_name = 'HbA1c' and status = 'confirmed' and value is not null order by observed_at desc nulls last limit 1", [profileId, reportId])).rows[0];
      if (prev) parts.push(`HbA1c is ${hba1c.value}% compared with ${prev.value}% previously.`);
    }
  }
  if (meds.length) parts.push(`It lists ${meds.length} medicine${meds.length === 1 ? "" : "s"}. Please check the names before they're added to your medicine list.`);
  if (extraction.unreadableCount) parts.push(`We couldn't reliably read ${extraction.unreadableCount} value${extraction.unreadableCount === 1 ? "" : "s"} and have not guessed ${extraction.unreadableCount === 1 ? "it" : "them"}.`);
  if (!parts.length) parts.push("We stored this document securely. We didn't find structured test results to summarise.");
  return parts.join(" ");
}

/** Confirmed glucose / HbA1c results become measurements so they appear in trends. */
async function syncConfirmedMeasurements(reportId: string) {
  const db = await getDb();
  const rows = (await db.query<ReportResult & { profile_id: string; report_date: string | null }>(
    "select rr.*, r.report_date from report_results rr join reports r on r.id = rr.report_id where rr.report_id = $1 and rr.status = 'confirmed' and rr.value is not null",
    [reportId],
  )).rows;
  for (const r of rows) {
    const info = labTestInfo(r.canonical_name);
    if (!info?.measurementType) continue;
    const exists = await db.query("select 1 from measurements where report_id = $1 and measurement_type = $2 and value = $3", [reportId, info.measurementType, r.value]);
    if (exists.rows.length) continue;
    await db.query(
      "insert into measurements(profile_id, measurement_type, value, unit, context, source, report_id, measured_at, notes) values ($1,$2,$3,$4,$5,'report',$6,$7,$8)",
      [r.profile_id, info.measurementType, r.value, info.unit, info.glucoseContext ?? null, reportId, r.report_date ? new Date(r.report_date + "T09:00:00") : new Date(), `From report`],
    );
  }
}

/** User confirms a value exactly as read (e.g. "Confirm 126"). */
export async function confirmResult(actor: Actor, resultId: string) {
  const db = await getDb();
  const r = (await db.query<ReportResult & { profile_id: string }>("select * from report_results where id = $1", [resultId])).rows[0];
  if (!r) throw new NotFoundError();
  await assertProfileAccess(actor, r.profile_id, "write");
  if (r.field_type === "lab_value" && r.value == null) throw new Error("This value couldn't be read. Please enter it manually.");
  await db.query("update report_results set status = 'confirmed', confirmed_by = $2, confirmed_at = now() where id = $1", [resultId, actor.id]);
  await refreshReportStatus(r.report_id);
  await syncConfirmedMeasurements(r.report_id);
}

/** User types the value from the paper copy. The original OCR text is kept for audit. */
export async function enterResultManually(actor: Actor, resultId: string, value: number, unit?: string | null) {
  const db = await getDb();
  const r = (await db.query<ReportResult & { profile_id: string }>("select * from report_results where id = $1", [resultId])).rows[0];
  if (!r) throw new NotFoundError();
  await assertProfileAccess(actor, r.profile_id, "write");
  if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error("Enter a valid number.");
  await db.query(
    "update report_results set value = $2::numeric, unit = coalesce($3, unit), status = 'confirmed', confidence = 1, confirmed_by = $4, confirmed_at = now(), normalised_text = canonical_name || ' ' || $2::numeric::text || ' (entered manually)' where id = $1",
    [resultId, value, unit ?? null, actor.id],
  );
  await refreshReportStatus(r.report_id);
  await syncConfirmedMeasurements(r.report_id);
}

/** Medication name confirmation from a report ("Did you mean Metformin?"). */
export async function resolveMedicationResult(actor: Actor, resultId: string, decision: { action: "accept" | "choose" | "manual" | "reject"; name?: string }) {
  const db = await getDb();
  const r = (await db.query<ReportResult & { profile_id: string }>("select * from report_results where id = $1", [resultId])).rows[0];
  if (!r || r.field_type !== "medication") throw new NotFoundError();
  await assertProfileAccess(actor, r.profile_id, "write");
  if (decision.action === "reject") {
    await db.query("update report_results set status = 'rejected' where id = $1", [resultId]);
  } else {
    const name = decision.action === "accept" ? r.canonical_name : decision.name?.trim();
    if (!name) throw new Error("Choose or enter a medicine name.");
    await db.query("update report_results set canonical_name = $2, status = 'confirmed', confirmed_by = $3, confirmed_at = now() where id = $1", [resultId, name, actor.id]);
  }
  await refreshReportStatus(r.report_id);
}

async function refreshReportStatus(reportId: string) {
  const db = await getDb();
  const pending = (await db.query<{ n: number }>("select count(*) as n from report_results where report_id = $1 and status in ('needs_confirmation','unreadable')", [reportId])).rows[0]!.n;
  await db.query("update reports set status = case when $2 = 0 then 'processed' else 'needs_confirmation' end, updated_at = now() where id = $1 and status in ('needs_confirmation','processed')", [reportId, pending]);
}

export async function updateReportMeta(actor: Actor, reportId: string, data: { title?: string; folderId?: string | null; profileId?: string; reportDate?: string | null; doctorName?: string | null }) {
  const db = await getDb();
  const r = (await db.query<{ family_id: string; profile_id: string }>("select family_id, profile_id from reports where id = $1", [reportId])).rows[0];
  if (!r) throw new NotFoundError();
  await assertFamilyAccess(actor, r.family_id, "write");
  if (data.profileId && data.profileId !== r.profile_id) {
    const p = await assertProfileAccess(actor, data.profileId, "write");
    if (p.family_id !== r.family_id) throw new ForbiddenError();
    await db.query("update report_results set profile_id = $2 where report_id = $1", [reportId, data.profileId]);
    await db.query("update measurements set profile_id = $2 where report_id = $1", [reportId, data.profileId]);
  }
  if (data.folderId) {
    const f = (await db.query<{ family_id: string }>("select family_id from report_folders where id = $1", [data.folderId])).rows[0];
    if (!f || f.family_id !== r.family_id) throw new ForbiddenError();
  }
  await db.query(
    `update reports set title = coalesce($2, title), folder_id = case when $3::text = '__keep__' then folder_id else $4::uuid end, profile_id = coalesce($5, profile_id),
      report_date = coalesce($6, report_date), doctor_name = coalesce($7, doctor_name), updated_at = now() where id = $1`,
    [reportId, data.title?.trim() || null, data.folderId === undefined ? "__keep__" : "set", data.folderId ?? null, data.profileId ?? null, data.reportDate ?? null, data.doctorName ?? null],
  );
  await logAccess(actor, "update", "report", reportId, r.family_id);
}

export async function deleteReport(actor: Actor, reportId: string) {
  const db = await getDb();
  const r = (await db.query<{ family_id: string }>("select family_id from reports where id = $1", [reportId])).rows[0];
  if (!r) throw new NotFoundError();
  await assertFamilyAccess(actor, r.family_id, "write");
  const files = (await db.query<{ storage_key: string }>("select storage_key from report_files where report_id = $1", [reportId])).rows;
  for (const f of files) await getStorage().delete(f.storage_key).catch(() => {});
  await db.query("delete from measurements where report_id = $1", [reportId]);
  await db.query("delete from reports where id = $1", [reportId]);
  await logAccess(actor, "delete", "report", reportId, r.family_id);
}

export { trendDirection, labTestInfo };
