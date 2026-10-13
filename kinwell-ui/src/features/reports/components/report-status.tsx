import { Badge } from "@/components/ui/misc";
import { CheckCircle2, Loader2 } from "lucide-react";

export function ReportStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "processed":
      return <Badge tone="success">Processed</Badge>;
    case "needs_confirmation":
      return <Badge tone="warning">Needs confirmation</Badge>;
    case "unreadable":
      return <Badge tone="danger">Unreadable</Badge>;
    case "failed":
      return <Badge tone="danger">Failed</Badge>;
    default:
      return (
        <Badge tone="info" icon={Loader2}>
          Processing
        </Badge>
      );
  }
}

export function ReviewedBadge() {
  return (
    <Badge tone="primary" icon={CheckCircle2}>
      Doctor reviewed
    </Badge>
  );
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  blood_test: "Blood test",
  prescription: "Prescription",
  imaging: "Imaging",
  discharge_summary: "Discharge summary",
  diabetes: "Diabetes",
  cardiology: "Cardiology",
  annual_checkup: "Annual checkup",
  other: "Document",
  unknown: "Document",
};
