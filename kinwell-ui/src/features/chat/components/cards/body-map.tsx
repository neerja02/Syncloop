import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { QuestionOption } from "@/lib/ai/types";

type Pick = (value: string, reply: string) => void;

/** A tappable spot on the figure. Coordinates are in the 200 × 420 drawing; value is "side:area[:spot]". */
interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  value: string;
  label: string;
}

/*
 * Front view: the person faces you, so THEIR right is on YOUR left. The labels under the figure say so, and
 * every spot's name ("Left knee") is from the person's own point of view.
 */
const FRONT: Spot[] = [
  { x: 76, y: 6, w: 48, h: 52, value: "head", label: "Head" },
  { x: 86, y: 60, w: 28, h: 16, value: "neck", label: "Neck" },
  { x: 44, y: 76, w: 26, h: 24, value: "right:shoulder", label: "Right shoulder" },
  { x: 130, y: 76, w: 26, h: 24, value: "left:shoulder", label: "Left shoulder" },
  { x: 72, y: 80, w: 18, h: 36, value: "right:chest", label: "Right side of the chest" },
  { x: 91, y: 80, w: 18, h: 36, value: "chest", label: "Centre of the chest" },
  { x: 110, y: 80, w: 18, h: 36, value: "left:chest", label: "Left side of the chest" },
  { x: 66, y: 118, w: 14, h: 30, value: "right:side", label: "Right side / ribs" },
  { x: 120, y: 118, w: 14, h: 30, value: "left:side", label: "Left side / ribs" },
  { x: 81, y: 118, w: 38, h: 30, value: "upper_abdomen", label: "Upper stomach" },
  { x: 81, y: 150, w: 38, h: 32, value: "lower_abdomen", label: "Lower stomach" },
  { x: 34, y: 126, w: 22, h: 30, value: "right:elbow", label: "Right elbow" },
  { x: 144, y: 126, w: 22, h: 30, value: "left:elbow", label: "Left elbow" },
  { x: 24, y: 192, w: 26, h: 34, value: "right:wrist_hand", label: "Right wrist or hand" },
  { x: 150, y: 192, w: 26, h: 34, value: "left:wrist_hand", label: "Left wrist or hand" },
  { x: 72, y: 186, w: 26, h: 24, value: "right:hip:groin", label: "Right hip or groin" },
  { x: 102, y: 186, w: 26, h: 24, value: "left:hip:groin", label: "Left hip or groin" },
  { x: 74, y: 212, w: 24, h: 44, value: "right:leg", label: "Right thigh" },
  { x: 102, y: 212, w: 24, h: 44, value: "left:leg", label: "Left thigh" },
  { x: 74, y: 258, w: 24, h: 30, value: "right:knee:front", label: "Front of the right knee" },
  { x: 102, y: 258, w: 24, h: 30, value: "left:knee:front", label: "Front of the left knee" },
  { x: 74, y: 290, w: 24, h: 64, value: "right:leg", label: "Right shin" },
  { x: 102, y: 290, w: 24, h: 64, value: "left:leg", label: "Left shin" },
  { x: 66, y: 358, w: 32, h: 34, value: "right:ankle_foot", label: "Right ankle or foot" },
  { x: 102, y: 358, w: 32, h: 34, value: "left:ankle_foot", label: "Left ankle or foot" },
];

/* Back view: you see their back, so THEIR left is on YOUR left. */
const BACK: Spot[] = [
  { x: 76, y: 6, w: 48, h: 52, value: "head", label: "Back of the head" },
  { x: 86, y: 60, w: 28, h: 16, value: "neck:back", label: "Back of the neck" },
  { x: 44, y: 76, w: 26, h: 24, value: "left:shoulder", label: "Left shoulder" },
  { x: 130, y: 76, w: 26, h: 24, value: "right:shoulder", label: "Right shoulder" },
  { x: 72, y: 80, w: 26, h: 36, value: "left:shoulder:back", label: "Left shoulder blade" },
  { x: 102, y: 80, w: 26, h: 36, value: "right:shoulder:back", label: "Right shoulder blade" },
  { x: 76, y: 118, w: 48, h: 26, value: "back", label: "Middle of the back" },
  { x: 76, y: 146, w: 48, h: 36, value: "back", label: "Lower back" },
  { x: 34, y: 126, w: 22, h: 30, value: "left:elbow:back", label: "Back of the left elbow" },
  { x: 144, y: 126, w: 22, h: 30, value: "right:elbow:back", label: "Back of the right elbow" },
  { x: 24, y: 192, w: 26, h: 34, value: "left:wrist_hand", label: "Left wrist or hand" },
  { x: 150, y: 192, w: 26, h: 34, value: "right:wrist_hand", label: "Right wrist or hand" },
  { x: 72, y: 186, w: 26, h: 28, value: "left:hip:buttock", label: "Left buttock" },
  { x: 102, y: 186, w: 26, h: 28, value: "right:hip:buttock", label: "Right buttock" },
  { x: 74, y: 216, w: 24, h: 40, value: "left:leg", label: "Back of the left thigh" },
  { x: 102, y: 216, w: 24, h: 40, value: "right:leg", label: "Back of the right thigh" },
  { x: 74, y: 258, w: 24, h: 30, value: "left:knee:back", label: "Back of the left knee" },
  { x: 102, y: 258, w: 24, h: 30, value: "right:knee:back", label: "Back of the right knee" },
  { x: 74, y: 290, w: 24, h: 64, value: "left:calf", label: "Left calf" },
  { x: 102, y: 290, w: 24, h: 64, value: "right:calf", label: "Right calf" },
  { x: 66, y: 358, w: 32, h: 34, value: "left:ankle_foot:heel", label: "Left heel or ankle" },
  { x: 102, y: 358, w: 32, h: 34, value: "right:ankle_foot:heel", label: "Right heel or ankle" },
];

/** A simple, neutral figure; the spots on top are the controls. */
function Figure() {
  return (
    <g className="fill-accent-light stroke-primary/35" strokeWidth={1.5}>
      <circle cx={100} cy={32} r={24} />
      <rect x={90} y={54} width={20} height={20} rx={6} />
      <path d="M62 80 Q100 66 138 80 L134 184 Q100 196 66 184 Z" />
      <rect x={40} y={80} width={22} height={112} rx={11} transform="rotate(6 51 80)" />
      <rect x={138} y={80} width={22} height={112} rx={11} transform="rotate(-6 149 80)" />
      <ellipse cx={37} cy={208} rx={11} ry={15} />
      <ellipse cx={163} cy={208} rx={11} ry={15} />
      <rect x={72} y={182} width={26} height={176} rx={13} />
      <rect x={102} y={182} width={26} height={176} rx={13} />
      <ellipse cx={82} cy={372} rx={15} ry={12} />
      <ellipse cx={118} cy={372} rx={15} ry={12} />
    </g>
  );
}

/** Front/back body map with left and right; the list of areas stays available underneath. */
export function BodyMapPicker({ onPick, disabled, list }: { onPick: Pick; disabled?: boolean; list: React.ReactNode; options: QuestionOption[] }) {
  const [view, setView] = useState<"front" | "back">("front");
  const [showList, setShowList] = useState(false);
  const spots = view === "front" ? FRONT : BACK;
  return (
    <div className="space-y-3">
      <div className="mx-auto flex w-fit rounded-full border border-line bg-surface p-1" role="tablist" aria-label="Body view">
        {(["front", "back"] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("min-h-9 rounded-full px-4 text-[14px] font-medium", view === v ? "bg-primary text-white" : "text-muted hover:text-ink")}>
            {v === "front" ? "Front" : "Back"}
          </button>
        ))}
      </div>
      <div className="relative mx-auto w-[200px] max-w-full" style={{ aspectRatio: "200 / 400" }}>
        <svg viewBox="0 0 200 400" className="absolute inset-0 h-full w-full" aria-hidden>
          <Figure />
        </svg>
        {spots.map((s) => (
          <button
            key={`${view}-${s.label}`}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s.value, s.label)}
            aria-label={s.label}
            title={s.label}
            className="absolute rounded-lg border border-transparent bg-primary/0 transition-colors hover:border-primary/40 hover:bg-primary/20 focus-visible:border-primary focus-visible:bg-primary/25 focus-visible:outline-none disabled:opacity-50"
            style={{ left: `${(s.x / 200) * 100}%`, top: `${(s.y / 400) * 100}%`, width: `${(s.w / 200) * 100}%`, height: `${(s.h / 400) * 100}%` }}
          />
        ))}
      </div>
      <div className="mx-auto flex w-[200px] justify-between text-[12px] text-muted" aria-hidden>
        <span>{view === "front" ? "Right" : "Left"}</span>
        <span>{view === "front" ? "Left" : "Right"}</span>
      </div>
      <p className="text-center text-[13px] text-muted">Tap where it hurts.</p>
      <button type="button" onClick={() => setShowList((v) => !v)} aria-expanded={showList} className="mx-auto flex min-h-10 items-center gap-1 text-[14px] font-medium text-primary-ink">
        Choose from a list instead <ChevronDown className={cn("h-4 w-4 transition-transform", showList && "rotate-180")} aria-hidden />
      </button>
      {showList && list}
    </div>
  );
}
