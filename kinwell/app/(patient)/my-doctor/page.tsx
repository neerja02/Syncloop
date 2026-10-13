import { requirePatient } from "@/lib/security/session";
import { getMyDoctor } from "@/lib/services/my-doctor";
import { MyDoctorDetails, MyDoctorEmpty } from "@/features/my-doctor/components/my-doctor-view";

export const metadata = { title: "My Doctor" };

export default async function MyDoctorPage() {
  const actor = await requirePatient();
  const d = await getMyDoctor(actor, actor.familyId);
  if (!d) return <MyDoctorEmpty />;
  return (
    <MyDoctorDetails
      doctor={{
        name: d.name,
        specialisation: d.specialisation,
        clinic_name: d.clinic_name,
        phone: d.phone,
        alt_phone: d.alt_phone,
        email: d.email,
        address: d.address,
        city: d.city,
        state: d.state,
        pincode: d.pincode,
        consultation_hours: d.consultation_hours,
        emergency_phone: d.emergency_phone,
        notes: d.notes,
        last_visit_date: d.last_visit_date,
        next_follow_up: d.next_follow_up,
        has_photo: !!d.photo_path,
        updated_at: new Date(d.updated_at).toISOString(),
      }}
    />
  );
}
