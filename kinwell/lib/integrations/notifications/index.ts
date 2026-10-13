import "server-only";
import { env } from "@/lib/config/env";
import { getDb } from "@/lib/database/client";

export type NotificationKind =
  | "medication_reminder"
  | "appointment_reminder"
  | "daily_check_in"
  | "report_processed"
  | "report_reviewed"
  | "doctor_response"
  | "doctor_message"
  | "goal_reminder"
  | "review_request"
  | "system";

export interface OutgoingNotification {
  userId: string;
  email?: string;
  familyId?: string | null;
  profileId?: string | null;
  kind: NotificationKind;
  title: string;
  /** Must be calm and non-diagnostic: never include speculative diagnoses or alarming content. */
  body: string;
  link?: string;
  dedupeKey?: string;
}

export interface NotificationProvider {
  readonly channel: "in_app" | "email" | "push";
  send(n: OutgoingNotification): Promise<void>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  link?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(m: EmailMessage): Promise<void>;
}

/** Development email adapter: messages are stored in the dev mailbox (visible at /dev/mailbox). */
export class DevMailboxEmailProvider implements EmailProvider {
  readonly name = "dev-mailbox";
  async send(m: EmailMessage) {
    const db = await getDb();
    await db.query("insert into dev_mailbox(to_email, subject, body, link) values ($1,$2,$3,$4)", [m.to, m.subject, m.text, m.link ?? null]);
    if (!env.isProduction) console.info(`[dev-mailbox] → ${m.to}: ${m.subject}${m.link ? " " + m.link : ""}`);
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  async send(m: EmailMessage) {
    if (!env.keys.resend) throw new Error("RESEND_API_KEY not configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.keys.resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Kinwell <no-reply@example.com>", to: m.to, subject: m.subject, text: m.link ? `${m.text}\n\n${m.link}` : m.text }),
    });
    if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
  }
}

export function getEmailProvider(): EmailProvider {
  return env.emailProvider === "resend" && env.keys.resend ? new ResendEmailProvider() : new DevMailboxEmailProvider();
}

export class InAppNotificationProvider implements NotificationProvider {
  readonly channel = "in_app" as const;
  async send(n: OutgoingNotification) {
    const db = await getDb();
    await db.query(
      `insert into notifications(user_id, family_id, profile_id, kind, title, body, link, channel, dedupe_key, sent_at)
       values ($1,$2,$3,$4,$5,$6,$7,'in_app',$8, now()) on conflict do nothing`,
      [n.userId, n.familyId ?? null, n.profileId ?? null, n.kind, n.title, n.body, n.link ?? null, n.dedupeKey ?? null],
    );
  }
}

export class EmailNotificationProvider implements NotificationProvider {
  readonly channel = "email" as const;
  async send(n: OutgoingNotification) {
    if (!n.email) return;
    await getEmailProvider().send({ to: n.email, subject: n.title, text: n.body, link: n.link ? env.appUrl + n.link : undefined });
  }
}

/** Web Push placeholder — requires VAPID keys and a stored PushSubscription per device. */
export class WebPushNotificationProvider implements NotificationProvider {
  readonly channel = "push" as const;
  async send() {
    // TODO(production): use the `web-push` package with VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY and stored subscriptions.
  }
}
