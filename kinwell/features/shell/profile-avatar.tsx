import { Avatar } from "@/components/ui/misc";

/** Profile photos are served through an authorised endpoint, never a public URL. */
export function ProfileAvatar({ profile, size = 32 }: { profile: { id: string; display_name: string; avatar_color: string; has_photo?: boolean; photo_url?: string | null }; size?: number }) {
  if (profile.has_photo || profile.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/profile-photo/${profile.id}`} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return <Avatar name={profile.display_name} color={profile.avatar_color} size={size} />;
}
