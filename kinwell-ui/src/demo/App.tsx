/**
 * Demo: the real Kinwell app shell (sidebar, top bar, bottom tabs, emergency panel) and chat, running on sample
 * data and a scripted mock API. Type anything, then tap a spot on the body map.
 */
import { AppShell } from "@/features/shell/app-shell";
import { ChatView } from "@/features/chat/components/chat-view";
import { HomeEmpty } from "@/features/chat/components/home-empty";
import { DEMO_PROFILE_ID, SAMPLE_SHELL } from "./sample-data";
import { installMockApi } from "./mock-api";

installMockApi();

export default function App() {
  return (
    <AppShell data={SAMPLE_SHELL}>
      <ChatView conversationId={null} profileId={DEMO_PROFILE_ID} initialMessages={[]} emptyState={<HomeEmpty name="Neerja" />} />
    </AppShell>
  );
}
