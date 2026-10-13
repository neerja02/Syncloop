import { call, type ActionResult } from "./client";

/** `input` is validated on the server against profileInputSchema (src/lib/validation/health.ts). */
export const createProfileAction = (input: unknown) => call<ActionResult<{ id: string }>>("createProfileAction", input);
export const updateProfileAction = (profileId: string, input: unknown) => call<ActionResult<unknown>>("updateProfileAction", profileId, input);
/** Deletes a profile and all its health data; `confirmName` must match the profile's name. */
export const deleteProfileAction = (profileId: string, confirmName: string) => call<ActionResult>("deleteProfileAction", profileId, confirmName);
/** `form` has a `photo` file field. */
export const uploadProfilePhotoAction = (profileId: string, form: FormData) => call<ActionResult>("uploadProfilePhotoAction", profileId, form);
export const addEmergencyContactAction = (profileId: string, input: { name: string; phone: string; relationship?: string }) =>
  call<ActionResult<unknown>>("addEmergencyContactAction", profileId, input);
export const removeEmergencyContactAction = (id: string) => call<ActionResult>("removeEmergencyContactAction", id);
