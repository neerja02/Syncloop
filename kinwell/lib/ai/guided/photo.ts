import "server-only";
import { z } from "zod";
import { getStorage } from "@/lib/integrations/storage";
import { assessImageQuality } from "@/lib/services/image-processing";
import { getReport } from "@/lib/services/reports";
import { getAIProvider } from "../providers";
import { HEALTH_AGENT_SYSTEM_PROMPT } from "../prompts/health-agent";
import type { AgentContext } from "../agents/context";

/**
 * Image Health Agent: judges quality first, describes only what is visible, asks for context, gives at most a few
 * cautiously phrased categories and visible red flags, and recommends a level of care. It never diagnoses from a
 * photo, and a photo never rules out something dangerous.
 */
export const IMAGE_AGENT_PROMPT = `${HEALTH_AGENT_SYSTEM_PROMPT}

You are now acting as the IMAGE HEALTH AGENT for one photo the user shared.
1. Judge image quality: good, limited or unusable. If it is unusable, say so and stop — don't guess.
2. Describe only objective, visible features ("a red raised area with several small bumps"). No diagnosis.
3. Give at most 4 possible categories, cautiously phrased ("could be consistent with…").
4. List any visible warning signs.
5. Choose the next step: emergency, same_day, clinician or monitor.
6. Say what the photo shows in general terms: skin, wound, swelling, eye, throat, nail, scalp, stool (stool or vomit), pet (a pet's skin or wound), pet_ear (a pet's ear or eye) or other.
For an animal, describe only what can reasonably be seen (for example "redness around the outer ear and some hair loss"); never diagnose infection or parasites from a photo.
Never claim a photo alone rules out a dangerous condition. Do not identify people.`;

export const imageFindingsSchema = z.object({
  imageQuality: z.enum(["good", "limited", "unusable"]),
  subject: z.enum(["skin", "wound", "swelling", "eye", "throat", "nail", "scalp", "stool", "pet", "pet_ear", "other"]),
  visibleFindings: z.array(z.string()).max(6),
  possibleCategories: z.array(z.string()).max(4),
  visibleRedFlags: z.array(z.string()).max(5),
  nextStep: z.enum(["emergency", "same_day", "clinician", "monitor"]),
});
export type ImageFindings = z.infer<typeof imageFindingsSchema>;

export interface PhotoReview {
  reportId: string;
  profileId: string;
  quality: "good" | "limited" | "unusable";
  qualityIssues: string[];
  /** Present only when a vision model actually looked at the photo. */
  findings: ImageFindings | null;
}

/** Loads the shared photo, checks it locally, and (with a vision model) asks for objective findings. */
export async function reviewPhotoFile(ctx: AgentContext, reportId: string): Promise<PhotoReview> {
  const { report, files } = await getReport(ctx.actor, reportId);
  const original = files.find((f) => f.variant === "original") ?? files[0];
  if (!original || !original.mime_type.startsWith("image/")) return { reportId, profileId: report.profile_id, quality: "unusable", qualityIssues: ["Not an image"], findings: null };
  const buffer = await getStorage().get(original.storage_key);
  const q = await assessImageQuality(buffer);
  const quality = !q.readable ? "unusable" : q.score < 0.75 ? "limited" : "good";
  const ai = getAIProvider();
  if (quality === "unusable" || !ai.supportsVision) return { reportId, profileId: report.profile_id, quality, qualityIssues: q.issues, findings: null };
  try {
    // Downscale before sending: the long edge stays within 1568px and the payload well under API limits.
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(buffer, { failOn: "none" }).rotate().resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const findings = await ai.structuredOutput({
      system: IMAGE_AGENT_PROMPT,
      messages: [{ role: "user", content: `This photo is about ${ctx.profile.relationship === "pet" ? `a pet ${ctx.profile.species ?? "animal"}` : "a person"}. Analyse it following the steps.` }],
      images: [{ mediaType: "image/jpeg", data: jpeg.toString("base64") }],
      schema: imageFindingsSchema,
      schemaName: "image_findings",
      maxTokens: 1500,
    });
    return { reportId, profileId: report.profile_id, quality: findings.imageQuality === "unusable" ? "unusable" : quality, qualityIssues: q.issues, findings };
  } catch (e) {
    console.error("[photo] vision analysis failed; falling back to guided questions", e);
    return { reportId, profileId: report.profile_id, quality, qualityIssues: q.issues, findings: null };
  }
}
