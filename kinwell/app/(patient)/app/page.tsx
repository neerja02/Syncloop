import { requirePatient } from "@/lib/security/session";
import { resolveProfile } from "@/lib/server/selected-profile";
import { ChatView } from "@/features/chat/components/chat-view";
import { HomeEmpty } from "@/features/chat/components/home-empty";
import { dueFollowUps } from "@/lib/services/follow-ups";

export const metadata = { title: "Health chat" };

export default async function AppHome({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const actor = await requirePatient();
  const { profile, profiles } = await resolveProfile(actor);
  // "New chat" links carry ?n=<timestamp> so the chat view always starts fresh.
  const { n } = await searchParams;
  const checkIns = (await dueFollowUps(actor, actor.familyId)).filter((f) => f.conversation_id).map((f) => ({ id: f.id, conversationId: f.conversation_id!, text: profiles.find((p) => p.id === f.profile_id)?.relationship === "self" ? `How is your ${f.topic} now?` : `How is ${f.profile_name}'s ${f.topic} now?` }));
  return <ChatView key={n ?? "home"} conversationId={null} profileId={profile.id} initialMessages={[]} emptyState={<HomeEmpty name={actor.fullName.split(" ")[0]!} checkIns={checkIns} />} />;
}
