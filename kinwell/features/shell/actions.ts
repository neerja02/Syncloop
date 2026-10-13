"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import { assertProfileAccess } from "@/lib/security/access";
import { listNotifications, markNotificationsRead } from "@/lib/services/notifications";
import { listConversations } from "@/lib/services/conversations";
import { globalSearch } from "@/lib/services/search";

export async function setSelectedProfileAction(profileId: string) {
  return run(async (actor) => {
    await assertProfileAccess(actor, profileId);
    (await cookies()).set("kw_profile", profileId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/", "layout");
  });
}

export async function notificationsAction() {
  return run(async (actor) => listNotifications(actor, 30));
}

export async function markNotificationsReadAction(ids?: string[]) {
  return run(async (actor) => {
    await markNotificationsRead(actor, ids);
    revalidatePath("/", "layout");
  });
}

export async function searchChatsAction(q: string) {
  return run(async (actor) => (actor.familyId ? (await listConversations(actor, actor.familyId, { q: q.slice(0, 100), limit: 20 })).map((c) => ({ id: c.id, title: c.title, profile: c.active_profile_name, last: c.last_message_at })) : []));
}

export async function globalSearchAction(q: string) {
  return run(async (actor) => globalSearch(actor, q));
}

/** Emergency contacts for the Emergency panel (the person currently being talked about). */
export async function emergencyContactsAction(profileId: string) {
  return run(async (actor) => {
    const { getEmergencyContacts } = await import("@/lib/services/profiles");
    return (await getEmergencyContacts(actor, profileId)).map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: c.phone }));
  });
}
