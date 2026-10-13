import { notFound } from "next/navigation";
import { getDb } from "@/lib/database/client";
import { env } from "@/lib/config/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dev mailbox" };

/** Development only: shows verification, magic-link and reset emails when no email provider is configured. */
export default async function DevMailbox() {
  if (env.isProduction) notFound();
  const db = await getDb();
  const mails = (await db.query<{ id: string; to_email: string; subject: string; body: string; link: string | null; created_at: Date }>("select * from dev_mailbox order by created_at desc limit 50")).rows;
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Development mailbox</h1>
      <p className="mt-1 text-muted">Emails that would be sent in production. Only available in development.</p>
      <ul className="mt-6 space-y-3">
        {mails.length === 0 && <li className="text-muted">No emails yet.</li>}
        {mails.map((m) => (
          <li key={m.id} className="rounded-[14px] border border-line bg-surface p-4">
            <p className="text-[13px] text-muted">
              To {m.to_email} · {new Date(m.created_at).toLocaleString("en-GB")}
            </p>
            <p className="font-semibold">{m.subject}</p>
            <p className="mt-1 text-[15px]">{m.body}</p>
            {m.link && (
              <a href={m.link} className="mt-2 inline-block break-all text-sm font-medium text-primary-ink underline">
                {m.link}
              </a>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
