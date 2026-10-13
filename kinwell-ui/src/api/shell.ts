import { call, type ActionResult } from "./client";

/** Remembers which family member new chats are about. */
export const setSelectedProfileAction = (profileId: string) => call<ActionResult>("setSelectedProfileAction", profileId);

/** Emergency contacts for the profile shown in the Emergency panel. */
export const emergencyContactsAction = (profileId: string) =>
  call<ActionResult<{ id: string; name: string; relationship: string | null; phone: string }[]>>("emergencyContactsAction", profileId);
