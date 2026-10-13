import { call, type ActionResult } from "./client";

/** Inputs are validated on the server against the schemas in src/lib/validation/health.ts. */
export const addMeasurementAction = (input: unknown) => call<ActionResult<{ id: string }>>("addMeasurementAction", input);
export const addConditionAction = (input: unknown) => call<ActionResult<unknown>>("addConditionAction", input);
export const updateConditionStatusAction = (id: string, status: "active" | "resolved" | "monitoring") => call<ActionResult<unknown>>("updateConditionStatusAction", id, status);
export const deleteConditionAction = (id: string) => call<ActionResult>("deleteConditionAction", id);
export const addAllergyAction = (input: unknown) => call<ActionResult<unknown>>("addAllergyAction", input);
export const deleteAllergyAction = (id: string) => call<ActionResult>("deleteAllergyAction", id);
