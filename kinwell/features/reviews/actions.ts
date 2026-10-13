"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import { actOnReview, addReviewFollowUp, createReview } from "@/lib/services/reviews";

export async function requestReviewAction(input: unknown) {
  return run(async (actor) => {
    const id = await createReview(actor, input);
    revalidatePath("/", "layout");
    return { reviewId: id };
  });
}
export async function reviewFollowUpAction(reviewId: string, text: string) {
  return run(async (actor) => {
    await addReviewFollowUp(actor, reviewId, text);
    revalidatePath("/", "layout");
  });
}
export async function doctorReviewAction(input: unknown) {
  return run(async (actor) => {
    await actOnReview(actor, input);
    revalidatePath("/", "layout");
  });
}
