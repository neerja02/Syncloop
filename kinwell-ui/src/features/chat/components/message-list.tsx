import { Siren } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { formatTime } from "@/lib/utils/format";
import type { Message } from "@/types/server";
import type { ChatCard } from "@/lib/ai/types";
import { MeasurementCard } from "./cards/measurement-card";
import { EmergencyActionCard } from "./cards/emergency-card";
import { QuestionCardView } from "./cards/question-card";
import { CareLevelBadge } from "./cards/care-level";
import { DoctorRecommendationCard, DoctorResults } from "./cards/doctor-cards";
import { Actions, DoctorGuidance, DoctorReplyBadge, InfoBlock, MedicationConfirm, MedicationInfo, ProfileSwitch, QuickReplies, RecordProposal, ReportSummary, Sources, Trend } from "./cards/other-cards";

function CardView({ card, messageId, isLast }: { card: ChatCard; messageId: string; isLast: boolean }) {
  switch (card.type) {
    case "care_level":
      return <CareLevelBadge card={card} />;
    case "question":
      // Only the latest unanswered question is interactive; older ones disappear once answered.
      return isLast ? <QuestionCardView card={card} /> : null;
    case "doctor_recommendation":
      return <DoctorRecommendationCard card={card} messageId={messageId} isLast={isLast} />;
    case "doctor_results":
      return <DoctorResults card={card} />;
    case "measurement_result":
      return <MeasurementCard card={card} messageId={messageId} />;
    case "emergency":
      return <EmergencyActionCard card={card} />;
    case "record_proposal":
      return <RecordProposal card={card} messageId={messageId} />;
    case "profile_switch":
      return <ProfileSwitch card={card} messageId={messageId} />;
    case "medication_confirm":
      return <MedicationConfirm card={card} messageId={messageId} />;
    case "doctor_guidance":
      return <DoctorGuidance card={card} />;
    case "sources":
      return <Sources card={card} />;
    case "quick_replies":
      return isLast ? <QuickReplies card={card} /> : null;
    case "actions":
      return <Actions card={card} messageId={messageId} />;
    case "report_summary":
      return <ReportSummary card={card} />;
    case "trend":
      return <Trend card={card} />;
    case "info":
      return <InfoBlock card={card} />;
    case "medication_info":
      return <MedicationInfo card={card} />;
    default:
      return null;
  }
}

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <ol className="space-y-5" aria-label="Conversation">
      {messages.map((m, idx) => {
        const isLast = idx === messages.length - 1;
        if (m.role === "system") {
          return (
            <li key={m.id} className="flex items-center gap-3 text-[13px] text-muted">
              <span className="h-px flex-1 bg-line" aria-hidden />
              {m.content}
              <span className="h-px flex-1 bg-line" aria-hidden />
            </li>
          );
        }
        if (m.role === "user") {
          return (
            <li key={m.id} className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[75%]">
                <p className="whitespace-pre-wrap break-words rounded-[20px] rounded-br-md bg-primary px-4 py-2.5 text-[16px] leading-snug text-white">{m.content}</p>
              </div>
            </li>
          );
        }
        const doctorReply = m.role === "doctor" ? (m.cards.find((c) => c.type === "doctor_reply") as Extract<ChatCard, { type: "doctor_reply" }> | undefined) : undefined;
        const emergency = m.urgency === "EMERGENCY";
        return (
          <li key={m.id} className="flex gap-2.5 sm:gap-3">
            <span className="mt-0.5 hidden shrink-0 sm:block" aria-hidden>
              {m.role === "doctor" ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-dark text-[11px] font-semibold text-white">Dr</span>
              ) : emergency ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white">
                  <Siren className="h-4 w-4" />
                </span>
              ) : (
                <LogoMark size={28} />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              {doctorReply && <DoctorReplyBadge doctorName={doctorReply.doctorName} />}
              {m.content && (
                <p className={m.role === "doctor" ? "whitespace-pre-wrap rounded-[14px] border border-primary/20 bg-accent-light/40 px-4 py-3 text-[15px]" : emergency ? "text-[16px] font-semibold leading-relaxed text-ink" : "whitespace-pre-wrap text-[16px] leading-relaxed"}>
                  {m.content}
                </p>
              )}
              {m.cards
                .filter((c) => c.type !== "doctor_reply")
                .map((c, i) => (
                  <CardView key={("id" in c && c.id) || i} card={c} messageId={m.id} isLast={isLast} />
                ))}
              {isLast && <p className="text-[11px] text-muted">{formatTime(m.created_at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
