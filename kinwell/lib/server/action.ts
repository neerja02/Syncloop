import "server-only";
import { ZodError } from "zod";
import { getActor } from "@/lib/security/session";
import { ForbiddenError, NotFoundError } from "@/lib/security/access";
import type { Actor } from "@/types/domain";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Wraps a server action: requires a session, maps validation/permission errors to friendly messages. */
export async function run<T>(fn: (actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: "Your session has ended. Please sign in again." };
  try {
    const data = await fn(actor);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
      return { ok: false, error: e.issues[0]?.message ?? "Please check the form.", fieldErrors };
    }
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return { ok: false, error: e.message };
    if (e instanceof Error && !/^(select|insert|update|delete)\b/i.test(e.message) && !/relation|syntax|column/i.test(e.message)) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
