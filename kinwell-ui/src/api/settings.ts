import { call, type ActionResult } from "./client";

export const updateAccountAction = (input: { fullName: string; countryCode: string }) => call<ActionResult<unknown>>("updateAccountAction", input);
export const setConsentAction = (type: "ai_processing" | "doctor_sharing" | "research", granted: boolean) => call<ActionResult<unknown>>("setConsentAction", type, granted);
export const changePasswordAction = (current: string, next: string) => call<ActionResult>("changePasswordAction", current, next);
/** The Next.js app sends the user to /login after this succeeds. */
export const signOutEverywhereAction = () => call<ActionResult>("signOutEverywhereAction");
/** `confirm` must be "DELETE". The Next.js app sends the user to the landing page after this succeeds. */
export const deleteAccountAction = (confirm: string) => call<ActionResult>("deleteAccountAction", confirm);
