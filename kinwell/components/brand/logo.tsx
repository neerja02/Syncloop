import { cn } from "@/lib/utils/cn";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#28328C" />
      <path d="M10 8.5v15" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M21.5 8.5 13.6 16l7.9 7.5" stroke="#59B6E6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="23.2" cy="16" r="2.1" fill="#EEF7FC" />
    </svg>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold tracking-tight text-primary-dark">Kinwell</span>
    </span>
  );
}
