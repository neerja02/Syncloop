import "server-only";
import { getDb } from "@/lib/database/client";
import { EmailNotificationProvider, InAppNotificationProvider, type OutgoingNotification } from "@/lib/integrations/notifications";
import type { Actor } from "@/types/domain";

const PREF_KEY: Partial<Record<OutgoingNotification["kind"], string>> = {
  medication_reminder: "medication",
  appointment_reminder: "appointments",
  daily_check_in: "daily_check_in",
  doctor_response: "doctor_responses",
  doctor_message: "doctor_responses",
  report_processed: "reports",
  report_reviewed: "reports",
  goal_reminder: "goals",
};

/** Fan-out to channels the user has enabled. In-app is always delivered; email/push respect preferences. */
export async function notify(n: OutgoingNotification) {
  const db = await getDb();
  const prefs = (await db.query<{ notifications: Record<string, boolean> }>("select notifications from user_preferences where user_id = $1", [n.userId])).rows[0]?.notifications ?? {};
  const key = PREF_KEY[n.kind];
  if (key && prefs[key] === false) return;
  await new InAppNotificationProvider().send(n);
  if (prefs.email !== false && n.email && n.kind !== "medication_reminder") {
    await new EmailNotificationProvider().send(n).catch(() => {});
  }
}

export async function notifyFamily(familyId: string, n: Omit<OutgoingNotification, "userId" | "email" | "familyId">) {
  const db = await getDb();
  const users = (await db.query<{ id: string; email: string }>("select u.id, u.email from family_memberships m join users u on u.id = m.user_id where m.family_id = $1", [familyId])).rows;
  for (const u of users) await notify({ ...n, userId: u.id, email: u.email, familyId });
}

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
}

export async function listNotifications(actor: Actor, limit = 30) {
  const db = await getDb();
  return (await db.query<NotificationRow>("select id, kind, title, body, link, read_at, created_at from notifications where user_id = $1 order by created_at desc limit $2", [actor.id, limit])).rows;
}

export async function unreadCount(actor: Actor) {
  const db = await getDb();
  return (await db.query<{ n: number }>("select count(*) as n from notifications where user_id = $1 and read_at is null", [actor.id])).rows[0]!.n;
}

export async function markNotificationsRead(actor: Actor, ids?: string[]) {
  const db = await getDb();
  if (ids?.length) await db.query("update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[])", [actor.id, ids]);
  else await db.query("update notifications set read_at = now() where user_id = $1 and read_at is null", [actor.id]);
}

/**
 * Reminder job (call from /api/cron/reminders every 15 minutes in production).
 * Creates medication, appointment and daily check-in reminders. Messages are neutral and non-diagnostic.
 */
export async function runReminderJob(now = new Date()) {
  const db = await getDb();
  let created = 0;
  const hhmm = (d: Date) => d.toTimeString().slice(0, 5);
  const windowStart = hhmm(new Date(now.getTime() - 15 * 60000));
  const windowEnd = hhmm(now);
  const day = now.toISOString().slice(0, 10);

  const meds = await db.query<{ id: string; name: string; strength: string | null; profile_id: string; display_name: string; family_id: string; t: string }>(
    `select m.id, m.name, m.strength, m.profile_id, p.display_name, p.family_id, t
     from medications m join profiles p on p.id = m.profile_id, unnest(m.reminder_times) t
     where m.status = 'active' and t > $1 and t <= $2`,
    [windowStart, windowEnd],
  );
  for (const m of meds.rows) {
    await notifyFamily(m.family_id, {
      kind: "medication_reminder",
      profileId: m.profile_id,
      title: `Medicine reminder · ${m.display_name}`,
      body: `It's time for ${m.name}${m.strength ? " " + m.strength : ""}, as scheduled.`,
      link: `/health/medications?profile=${m.profile_id}`,
      dedupeKey: `med:${m.id}:${day}:${m.t}`,
    });
    created++;
  }

  const appts = await db.query<{ id: string; profile_id: string; family_id: string; display_name: string; starts_at: Date; provider_name: string | null }>(
    `select a.id, a.profile_id, a.family_id, p.display_name, a.starts_at, coalesce(d.full_name, a.provider_name) as provider_name
     from appointments a join profiles p on p.id = a.profile_id left join doctors d on d.id = a.doctor_id
     where a.status in ('requested','confirmed') and a.starts_at between $1 and $1::timestamptz + interval '24 hours'`,
    [now],
  );
  for (const a of appts.rows) {
    await notifyFamily(a.family_id, {
      kind: "appointment_reminder",
      profileId: a.profile_id,
      title: `Upcoming appointment · ${a.display_name}`,
      body: `${a.provider_name ?? "Appointment"} on ${new Date(a.starts_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`,
      link: `/appointments`,
      dedupeKey: `appt:${a.id}:24h`,
    });
    created++;
  }

  const checkins = await db.query<{ user_id: string; email: string }>(
    `select p.user_id, u.email from user_preferences p join users u on u.id = p.user_id
     where (p.notifications->>'daily_check_in')::boolean is not false and p.daily_check_in_time > $1 and p.daily_check_in_time <= $2`,
    [windowStart, windowEnd],
  );
  for (const c of checkins.rows) {
    await notify({ userId: c.user_id, kind: "daily_check_in", title: "Daily check-in", body: "How are you feeling today? A quick check-in helps your coach personalise tips.", link: "/app", dedupeKey: `checkin:${day}` });
    created++;
  }
  return { created };
}
