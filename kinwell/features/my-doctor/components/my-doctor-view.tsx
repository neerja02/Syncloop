"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Clock, MapPin, Mail, NotebookPen, Pencil, Phone, Stethoscope, CalendarCheck } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { Button, buttonClass } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";
import { uploadMyDoctorPhotoAction, deleteMyDoctorAction } from "../actions";
import { MyDoctorFormDialog, type MyDoctorFormValues } from "./my-doctor-form";

export interface MyDoctorView extends MyDoctorFormValues {
  has_photo: boolean;
  updated_at: string;
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

export function MyDoctorEmpty() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-light text-primary-ink">
        <Stethoscope className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-4 text-[22px] font-semibold tracking-tight">Your regular doctor</h1>
      <p className="mt-1.5 max-w-xs text-muted">Keep your doctor&apos;s details handy whenever you need them.</p>
      <Button className="mt-6 w-full max-w-xs" size="lg" onClick={() => setOpen(true)}>
        Add Doctor
      </Button>
      {open && <MyDoctorFormDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

export function MyDoctorDetails({ doctor }: { doctor: MyDoctorView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [photoKey, setPhotoKey] = useState(doctor.updated_at);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const address = [doctor.address, doctor.city, doctor.state, doctor.pincode].filter(Boolean).join(", ");
  const fullAddress = [doctor.clinic_name, address].filter(Boolean).join(", ");

  const rows: { icon: typeof Phone; label: string; value: React.ReactNode }[] = [];
  if (doctor.phone) rows.push({ icon: Phone, label: "Phone", value: <a className="text-primary-ink hover:underline" href={tel(doctor.phone)}>{doctor.phone}</a> });
  if (doctor.alt_phone) rows.push({ icon: Phone, label: "Alternate phone", value: <a className="text-primary-ink hover:underline" href={tel(doctor.alt_phone)}>{doctor.alt_phone}</a> });
  if (doctor.emergency_phone) rows.push({ icon: Phone, label: "Emergency number", value: <a className="text-primary-ink hover:underline" href={tel(doctor.emergency_phone)}>{doctor.emergency_phone}</a> });
  if (address) rows.push({ icon: MapPin, label: "Address", value: address });
  if (doctor.consultation_hours) rows.push({ icon: Clock, label: "Clinic hours", value: doctor.consultation_hours });
  if (doctor.email) rows.push({ icon: Mail, label: "Email", value: <a className="text-primary-ink hover:underline" href={`mailto:${doctor.email}`}>{doctor.email}</a> });
  if (doctor.last_visit_date || doctor.next_follow_up)
    rows.push({ icon: CalendarCheck, label: "Visits", value: [doctor.last_visit_date ? `Last visit ${formatDate(doctor.last_visit_date)}` : null, doctor.next_follow_up ? `Follow-up ${formatDate(doctor.next_follow_up)}` : null].filter(Boolean).join(" · ") });
  if (doctor.notes) rows.push({ icon: NotebookPen, label: "Notes", value: <span className="whitespace-pre-wrap">{doctor.notes}</span> });

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          {doctor.has_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/my-doctor-photo?v=${encodeURIComponent(photoKey)}`} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <Avatar name={doctor.name.replace(/^dr\.?\s*/i, "")} size={80} color="#28328C" />
          )}
          <button type="button" onClick={() => photoInput.current?.click()} className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-[var(--shadow-soft)] hover:text-ink" aria-label="Change photo">
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Doctor photo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.set("photo", f);
              start(async () => {
                const r = await uploadMyDoctorPhotoAction(fd);
                if (!r.ok) return setError(r.error);
                setPhotoKey(String(Date.now()));
                router.refresh();
              });
            }}
          />
        </div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight">{doctor.name}</h1>
        {doctor.specialisation && <p className="text-[15px] text-muted">{doctor.specialisation}</p>}
        {doctor.clinic_name && <p className="text-[15px] text-muted">{doctor.clinic_name}</p>}
        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {doctor.phone ? (
          <a href={tel(doctor.phone)} className={buttonClass("primary", "lg")}>
            <Phone className="h-5 w-5" aria-hidden /> Call
          </a>
        ) : (
          <Button size="lg" variant="secondary" onClick={() => setEditing(true)}>
            <Phone className="h-5 w-5" aria-hidden /> Add phone
          </Button>
        )}
        {fullAddress ? (
          <a href={mapsUrl(fullAddress)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "lg")}>
            <MapPin className="h-5 w-5" aria-hidden /> Directions
          </a>
        ) : (
          <Button size="lg" variant="secondary" onClick={() => setEditing(true)}>
            <MapPin className="h-5 w-5" aria-hidden /> Add address
          </Button>
        )}
      </div>

      {rows.length > 0 && (
        <dl className="mt-6 divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-3 px-4 py-3.5">
              <r.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-[13px] text-muted">{r.label}</dt>
                <dd className="break-words text-[15px]">{r.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="secondary" onClick={() => setEditing(true)} disabled={pending}>
          <Pencil className="h-4 w-4" aria-hidden /> Edit Details
        </Button>
        <button
          type="button"
          className="text-[14px] text-muted hover:text-danger"
          onClick={() => {
            if (!confirm(`Remove ${doctor.name} from My Doctor?`)) return;
            start(async () => {
              await deleteMyDoctorAction();
              router.refresh();
            });
          }}
        >
          Remove
        </button>
      </div>
      {editing && <MyDoctorFormDialog initial={doctor} onClose={() => setEditing(false)} />}
    </div>
  );
}
