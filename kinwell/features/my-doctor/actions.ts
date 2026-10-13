"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import { deleteMyDoctor, saveMyDoctor, setMyDoctorPhoto } from "@/lib/services/my-doctor";
import { getStorage } from "@/lib/integrations/storage";

function familyOf(actor: { familyId: string | null }) {
  if (!actor.familyId) throw new Error("Finish setting up your account first.");
  return actor.familyId;
}

export async function saveMyDoctorAction(input: Record<string, unknown>) {
  return run(async (actor) => {
    const d = await saveMyDoctor(actor, familyOf(actor), input);
    revalidatePath("/", "layout");
    return { id: d.id };
  });
}

export async function uploadMyDoctorPhotoAction(form: FormData) {
  return run(async (actor) => {
    const familyId = familyOf(actor);
    const file = form.get("photo");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) throw new Error("Choose an image under 8 MB.");
    const sharp = (await import("sharp")).default;
    const buf = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" }).rotate().resize(320, 320, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    const key = `families/${familyId}/my-doctor/photo.jpg`;
    await getStorage().put(key, buf, "image/jpeg");
    await setMyDoctorPhoto(actor, familyId, key);
    revalidatePath("/", "layout");
  });
}

export async function deleteMyDoctorAction() {
  return run(async (actor) => {
    await deleteMyDoctor(actor, familyOf(actor));
    revalidatePath("/", "layout");
  });
}
