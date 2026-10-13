import { useShell } from "./shell-context";
import { UploadDialog } from "./dialogs/upload-dialog";
import { CameraDialog } from "./dialogs/camera-dialog";
import { ReadingDialog } from "./dialogs/reading-dialog";
import { FolderDialog, ProfileDialog } from "./dialogs/simple-dialogs";
import { AttachSheet, PickReportSheet } from "./dialogs/attach-sheet";
import { MyDoctorFormDialog } from "@/features/my-doctor/components/my-doctor-form";
import { EmergencyPanel } from "./emergency-panel";

export function DialogHost() {
  const { dialog, closeDialog } = useShell();
  if (!dialog) return null;
  switch (dialog.kind) {
    case "upload":
      return <UploadDialog key={dialog.file?.name ?? "upload"} profileId={dialog.profileId} folderId={dialog.folderId} purpose={dialog.purpose} initialFile={dialog.file} onUploaded={dialog.onUploaded} onClose={closeDialog} />;
    case "camera":
      return <CameraDialog profileId={dialog.profileId} onUploaded={dialog.onUploaded} onClose={closeDialog} />;
    case "attach":
      return <AttachSheet profileId={dialog.profileId} onUploaded={dialog.onUploaded} onPicked={dialog.onPicked} onClose={closeDialog} />;
    case "pick_report":
      return <PickReportSheet profileId={dialog.profileId} onPicked={dialog.onPicked} onClose={closeDialog} />;
    case "emergency":
      return <EmergencyPanel onClose={closeDialog} />;
    case "my_doctor":
      return <MyDoctorFormDialog onClose={closeDialog} />;
    case "reading":
      return <ReadingDialog profileId={dialog.profileId} type={dialog.type} onClose={closeDialog} />;
    case "folder":
      return <FolderDialog onClose={closeDialog} />;
    case "profile":
      return <ProfileDialog relationship={dialog.relationship} onClose={closeDialog} />;
    default:
      return null;
  }
}
