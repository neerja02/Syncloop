"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { run } from "@/lib/server/action";
import { addEmergencyContact, createProfile, deleteProfile, removeEmergencyContact, updateProfile } from "@/lib/services/profiles";
import { assignDoctor, endDoctorAssignment } from "@/lib/services/families";
import { assertProfileAccess } from "@/lib/security/access";
import { getStorage } from "@/lib/integrations/storage";
import { getDb } from "@/lib/database/client";
import { sendMessage } from "@/lib/services/doctor";

const refresh = () => revalidatePath("/", "layout");

export async function createProfileAction(input: unknown) {
  return run(async (actor) => {
    if (!actor.familyId) throw new Error("No family found");
    const p = await createProfile(actor, actor.familyId, input);
    refresh();
    return { id: p.id };
  });
}
export async function updateProfileAction(profileId: string, input: unknown) {
  return run(async (actor) => {
    await updateProfile(actor, profileId, input);
    refresh();
  });
}
export async function deleteProfileAction(profileId: string, confirmName: string) {
  const res = await run(async (actor) => {
    const p = await assertProfileAccess(actor, profileId, "write");
    if (confirmName.trim().toLowerCase() !== p.display_name.toLowerCase()) throw new Error(`Type "${p.display_name}" to confirm.`);
    await deleteProfile(actor, profileId);
  });
  if (res.ok) {
    refresh();
    redirect("/family");
  }
  return res;
}
export async function uploadProfilePhotoAction(profileId: string, form: FormData) {
  return run(async (actor) => {
    const ref = await assertProfileAccess(actor, profileId, "write");
    const file = form.get("photo");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) throw new Error("Choose an image under 8 MB.");
    const sharp = (await import("sharp")).default;
    const buf = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" }).rotate().resize(320, 320, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    const key = `families/${ref.family_id}/profiles/${profileId}/photo.jpg`;
    await getStorage().put(key, buf, "image/jpeg");
    const db = await getDb();
    await db.query("update profiles set photo_url = $2, updated_at = now() where id = $1", [profileId, key]);
    refresh();
  });
}
export async function addEmergencyContactAction(profileId: string, input: { name: string; phone: string; relationship?: string }) {
  return run(async (actor) => {
    await addEmergencyContact(actor, profileId, input);
    refresh();
  });
}
export async function removeEmergencyContactAction(id: string) {
  return run(async (actor) => {
    await removeEmergencyContact(actor, id);
    refresh();
  });
}
export async function assignDoctorAction(doctorId: string) {
  return run(async (actor) => {
    if (!actor.familyId) throw new Error("No family");
    await assignDoctor(actor, actor.familyId, doctorId);
    refresh();
  });
}
export async function endDoctorAssignmentAction() {
  return run(async (actor) => {
    if (!actor.familyId) throw new Error("No family");
    await endDoctorAssignment(actor, actor.familyId);
    refresh();
  });
}
export async function sendDoctorMessageAction(body: string, profileId?: string | null) {
  return run(async (actor) => {
    if (!actor.familyId) throw new Error("No family");
    await sendMessage(actor, actor.familyId, body, profileId);
    refresh();
  });
}
