import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";

const STEPS = ["Checking your health history…", "Looking for relevant doctor guidance…", "Checking safety guidance…", "Putting it together…"];

export function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(STEPS.length - 1, x + 1)), 1100);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <LogoMark size={28} />
      <span className="flex gap-1" aria-hidden>
        <span className="kw-dot h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="kw-dot h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="kw-dot h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
      <span className="text-sm text-muted">{STEPS[i]}</span>
    </div>
  );
}
