"use client";
import { Camera, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShell } from "@/features/shell/shell-context";

export function UploadButton({ profileId, folderId, variant = "primary", label = "Upload report" }: { profileId?: string; folderId?: string; variant?: "primary" | "secondary"; label?: string }) {
  const shell = useShell();
  return (
    <Button variant={variant} onClick={() => shell.openDialog({ kind: "upload", profileId, folderId })}>
      <Plus className="h-4 w-4" aria-hidden /> {label}
    </Button>
  );
}

export function TakePhotoButton({ profileId }: { profileId?: string }) {
  const shell = useShell();
  return (
    <Button variant="secondary" onClick={() => shell.openDialog({ kind: "camera", profileId })}>
      <Camera className="h-4 w-4" aria-hidden /> Take Photo
    </Button>
  );
}
