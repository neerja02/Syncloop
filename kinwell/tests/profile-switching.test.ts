import { beforeAll, describe, expect, it } from "vitest";
import { detectProfileMention } from "@/lib/ai/agents/family-context";
import { createConversation, getConversation } from "@/lib/services/conversations";
import { handleUserMessage, resolveProfileSwitch } from "@/lib/ai/orchestrator";
import type { Profile } from "@/types/domain";
import { count, createWorld, type TestWorld } from "./helpers";

let w: TestWorld;
let profiles: Profile[];
beforeAll(async () => {
  w = await createWorld();
  profiles = (await w.db.query<Profile>("select * from profiles where family_id = $1", [w.demo.familyId])).rows;
});

describe("family context agent", () => {
  it("detects that a message is about someone else", () => {
    const d = detectProfileMention("My father has had a cough", profiles, w.profiles.me);
    expect(d.mentionedProfileId).toBe(w.profiles.dad);
    expect(d.subjectChanged).toBe(true);
  });
  it("uses the latest subject when several people are mentioned", () => {
    const d = detectProfileMention("I feel better now, but my mother has a headache", profiles, w.profiles.me);
    expect(d.mentionedProfileId).toBe(w.profiles.mom);
  });
  it("does not flag a change when talking about the active profile", () => {
    expect(detectProfileMention("Mom has a fever", profiles, w.profiles.mom).subjectChanged).toBe(false);
    expect(detectProfileMention("I have a headache", profiles, w.profiles.me).subjectChanged).toBe(false);
  });
  it("offers to create a profile for a relative who doesn't have one", () => {
    expect(detectProfileMention("my grandmother has a cold", profiles, w.profiles.me).missingRelationship).toBe("grandparent");
  });
});

describe("profile switching in a conversation", () => {
  it("asks before switching and never saves to the wrong person", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const symptomsBefore = await count(w.db, "select count(*) as n from symptoms");
    const turn = await handleUserMessage(w.demo, conv, "I feel better now, but my mother has a headache");
    const card = turn.assistantMessage.cards.find((c) => c.type === "profile_switch") as { id: string; profileId: string } | undefined;
    expect(card?.profileId).toBe(w.profiles.mom);
    expect((await getConversation(w.demo, conv)).conversation.active_profile_id).toBe(w.profiles.me);
    expect(await count(w.db, "select count(*) as n from symptoms")).toBe(symptomsBefore);

    await resolveProfileSwitch(w.demo, conv, turn.assistantMessage.id, card!.id, "switch");
    const after = await getConversation(w.demo, conv);
    expect(after.conversation.active_profile_id).toBe(w.profiles.mom);
    const last = after.messages.at(-1)!;
    expect(last.role).toBe("assistant");
    expect(last.profile_id).toBe(w.profiles.mom);
  });
  it("chat measurement proposals are not written until confirmed", async () => {
    const conv = await createConversation(w.demo, w.profiles.me);
    const before = await count(w.db, "select count(*) as n from measurements where profile_id = $1", [w.profiles.me]);
    // Value, context and timing are all in one message, so the agent can answer straight away.
    const turn = await handleUserMessage(w.demo, conv, "My sugar was 184 two hours after lunch");
    expect(turn.assistantMessage.cards.some((c) => c.type === "record_proposal")).toBe(true);
    expect(await count(w.db, "select count(*) as n from measurements where profile_id = $1", [w.profiles.me])).toBe(before);
  });
});
