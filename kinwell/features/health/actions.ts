"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import {
  addAllergy,
  addCheckIn,
  addCondition,
  addGoal,
  addMeasurement,
  deleteAllergy,
  deleteCondition,
  deleteMeasurement,
  saveMedication,
  setMedicationStatus,
  updateConditionStatus,
  updateGoalProgress,
} from "@/lib/services/health-record";
import { getMedicationTerminology } from "@/lib/integrations/terminology/medication";

const refresh = () => revalidatePath("/", "layout");

export async function addMeasurementAction(input: unknown) {
  return run(async (actor) => {
    const m = await addMeasurement(actor, input);
    refresh();
    return { id: m.id };
  });
}
export async function deleteMeasurementAction(id: string) {
  return run(async (actor) => {
    await deleteMeasurement(actor, id);
    refresh();
  });
}
export async function saveMedicationAction(input: unknown, medicationId?: string) {
  return run(async (actor) => {
    const r = await saveMedication(actor, input, medicationId);
    if (r.status === "saved") refresh();
    return r;
  });
}
export async function setMedicationStatusAction(id: string, status: "active" | "stopped" | "completed") {
  return run(async (actor) => {
    await setMedicationStatus(actor, id, status);
    refresh();
  });
}
export async function normaliseMedicineAction(text: string) {
  return run(async () => getMedicationTerminology().normalise(text.slice(0, 120)));
}
export async function addConditionAction(input: unknown) {
  return run(async (actor) => {
    await addCondition(actor, input);
    refresh();
  });
}
export async function updateConditionStatusAction(id: string, status: "active" | "resolved" | "monitoring") {
  return run(async (actor) => {
    await updateConditionStatus(actor, id, status);
    refresh();
  });
}
export async function deleteConditionAction(id: string) {
  return run(async (actor) => {
    await deleteCondition(actor, id);
    refresh();
  });
}
export async function addAllergyAction(input: unknown) {
  return run(async (actor) => {
    await addAllergy(actor, input);
    refresh();
  });
}
export async function deleteAllergyAction(id: string) {
  return run(async (actor) => {
    await deleteAllergy(actor, id);
    refresh();
  });
}
export async function addGoalAction(input: unknown) {
  return run(async (actor) => {
    await addGoal(actor, input);
    refresh();
  });
}
export async function updateGoalProgressAction(id: string, progress: number) {
  return run(async (actor) => {
    await updateGoalProgress(actor, id, progress);
    refresh();
  });
}
export async function checkInAction(profileId: string, mood: string) {
  return run(async (actor) => {
    await addCheckIn(actor, profileId, mood);
    refresh();
  });
}
