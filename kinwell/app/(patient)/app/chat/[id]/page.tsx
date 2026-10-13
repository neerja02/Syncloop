import { notFound } from "next/navigation";
import { requirePatient } from "@/lib/security/session";
import { getConversation } from "@/lib/services/conversations";
import { deliverDueFollowUp } from "@/lib/services/follow-ups";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import { ChatView } from "@/features/chat/components/chat-view";

export const metadata = { title: "Health chat" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePatient();
  const { id } = await params;
  // A due check-in is asked in the conversation itself when it's opened.
  await deliverDueFollowUp(actor, id).catch(() => false);
  const data = await getConversation(actor, id).catch((e) => {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  });
  const { conversation, messages } = data;
  return <ChatView key={conversation.id} conversationId={conversation.id} profileId={conversation.active_profile_id} initialMessages={messages} />;
}
