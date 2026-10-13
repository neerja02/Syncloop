import { call, type ActionResult } from "./client";

/** The family's regular doctor — a contact card the patient maintains (not a doctor account). */
export const saveMyDoctorAction = (input: Record<string, unknown>) => call<ActionResult<{ id: string }>>("saveMyDoctorAction", input);
/** `form` has a `photo` file field. */
export const uploadMyDoctorPhotoAction = (form: FormData) => call<ActionResult>("uploadMyDoctorPhotoAction", form);
export const deleteMyDoctorAction = () => call<ActionResult>("deleteMyDoctorAction");
