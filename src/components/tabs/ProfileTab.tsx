import { useAuth } from "../../auth/auth";
import { go } from "../../auth/route";
import { FREQ_ORDER } from "../../domain/catalog";
import { visitText } from "../../domain/health";
import { useStore } from "../../store/useStore";
import { ContactsEditor } from "../ui/ContactsEditor";
import { Badge, ChannelBadge } from "../ui/ui";

const ALERTS = { missed: "A medicine is missed twice", range: "A reading is out of safe range", noanswer: "Two check-in calls go unanswered" };

const Row = ({ title, sub, right, first }: { title: string; sub?: string; right?: React.ReactNode; first?: boolean }) => (
  <div className={`flex items-start justify-between gap-3 py-2.5 ${first ? "" : "border-t border-line"}`}>
    <div className="min-w-0"><strong className="block">{title}</strong>{sub && <span className="text-sm text-muted">{sub}</span>}</div>
    {right && <div className="flex flex-none flex-col items-end gap-1">{right}</div>}
  </div>
);

export function ProfileTab() {
  const p = useStore((s) => s.current());
  const cur = useStore((s) => s.cur);
  const openOnboarding = useStore((s) => s.openOnboarding);
  const mutate = useStore((s) => s.mutate);
  const openSos = useStore((s) => s.openSos);
  const { user, logout } = useAuth();
  if (!p) return null;
  const pr = p.pr;
  const groups = FREQ_ORDER.map((f) => [f, p.plan.filter((r) => r.freq === f)] as const).filter(([, rs]) => rs.length);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">{pr.name}</h2>
        <p className="-mt-2 text-sm text-muted">{[pr.age && `${pr.age} years`, pr.gender, `speaks ${pr.lang}`, pr.phone].filter(Boolean).join(" · ")}</p>
        <div className="panel">
          <Row first title="Health conditions" sub={pr.conditions.join(", ") || "None added"} />
          <Row title="Allergies" sub={pr.allergies || "None"} />
          <Row title="History" sub={pr.history || "—"} />
          <Row title="Family contact" sub={`${pr.cg.name} (${pr.cg.rel}) · ${pr.cg.phone}`} />
        </div>
        <button className="btn-ghost self-start" onClick={() => openOnboarding(cur)}>Edit profile</button>
      </section>

      <section className="mb-6 flex flex-col gap-3" aria-labelledby="sos-title">
        <h2 id="sos-title" className="sec-title">Emergency contacts</h2>
        <p className="-mt-1.5 text-sm text-muted">
          When {pr.first} ji presses the red <b className="text-bad">SOS</b> button, Nia calls these people and sends them a WhatsApp message with {pr.first} ji's location.
          {!pr.sos?.some((c) => c.phone.trim()) && pr.cg.phone && ` Until you add someone, ${pr.cg.name} (family contact) is used.`}
        </p>
        <ContactsEditor idPrefix="p-sos" value={pr.sos ?? []} onChange={(v) => mutate((x) => void (x.pr.sos = v))} />
        <button className="btn-ghost self-start border-bad text-bad" onClick={openSos}>Test the SOS button</button>
      </section>

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">Nia's care plan</h2>
        <p className="-mt-1.5 text-sm text-muted">Built from {pr.first} ji's conditions. Nia collects each reading on its schedule.</p>
        {groups.map(([f, rs]) => (
          <div key={f} className="panel">
            <p className="cap mb-1">{f}</p>
            {rs.map((r, i) => (
              <div key={r.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 py-2 ${i ? "border-t border-line" : ""}`}>
                <strong>{r.name}</strong><ChannelBadge ch={r.ch} />
                <span className="text-[13px] text-muted">{r.when}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">Check-ins</h2>
        <div className="panel">
          <Row first title="Daily call" sub="How are you, morning medicines, BP" right={<><ChannelBadge ch="Call" /><span className="text-sm text-muted">{pr.checkin.call}</span></>} />
          <Row title="Morning medicines" sub="Reminder and confirmation" right={<ChannelBadge ch={pr.checkin.medMorning} />} />
          <Row title="Afternoon & night medicines" sub="Reminder with one-tap reply" right={<ChannelBadge ch={pr.checkin.medNight} />} />
          <Row title="Weekly health check" sub="Sleep, pain, appetite, mood, weight" right={<><ChannelBadge ch="Call" /><span className="text-sm text-muted">{pr.checkin.weekly}</span></>} />
          <Row title="Doctor visit reminder" sub="Day before, with tests and papers to carry" right={<ChannelBadge ch="WhatsApp" />} />
        </div>
      </section>

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">Doctors</h2>
        <div className="panel">
          {pr.doctors.map((d, i) => <Row key={i} first={i === 0} title={d.name} sub={`${d.sp}${d.tests ? ` · test before visit: ${d.tests}` : ""}`} right={<Badge tone={d.date ? "acc" : "warn"}>{d.date ? visitText(d) : "Not booked"}</Badge>} />)}
        </div>
      </section>

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="sec-title">Alert {pr.cg.name || "family"} when</h2>
        <div className="panel">
          {pr.checkin.alerts.map((a, i) => <Row key={a} first={i === 0} title={ALERTS[a]} right={<Badge tone="warn">Alert</Badge>} />)}
          <Row first={!pr.checkin.alerts.length} title="Emergency words (chest pain, fall, breathless)" right={<Badge tone="bad">Call now</Badge>} />
        </div>
      </section>

      <section className="mb-6 flex flex-col gap-3" aria-labelledby="acct-title">
        <h2 id="acct-title" className="sec-title">Your account</h2>
        <div className="panel">
          <Row first title={user?.name ?? ""} sub={user?.email} />
        </div>
        <p className="-mt-1 text-sm text-muted">Profiles and readings are saved in this browser for your account. Log in here again to see them.</p>
        <button className="btn-ghost self-start" onClick={async () => { await logout(); go("home"); }}>Log out</button>
      </section>
    </div>
  );
}
