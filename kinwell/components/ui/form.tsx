import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const field =
  "w-full rounded-[var(--radius-input)] border border-line bg-surface px-3.5 text-[16px] text-ink placeholder:text-muted/70 transition-colors hover:border-slate-300 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15 disabled:bg-subtle aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(field, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(field, "py-2.5 min-h-[88px]", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(field, "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%2364748B%22 stroke-width=%222%22 viewBox=%220 0 24 24%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
});

export function Label({ htmlFor, children, hint, required }: { htmlFor?: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
      {children}
      {required ? <span className="text-danger"> *</span> : <span className="font-normal text-muted"> {hint ?? ""}</span>}
    </label>
  );
}

export function Field({ label, htmlFor, hint, error, required, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string | null; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} hint={hint} required={required}>
        {label}
      </Label>
      {children}
      {error && (
        <p className="mt-1.5 text-[13px] text-danger" role="alert" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[var(--radius-input)] border border-danger/30 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
      {message}
    </div>
  );
}
