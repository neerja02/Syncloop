import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Mic, Plus, Square } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getVoiceInput } from "@/lib/voice";

/**
 * The chat composer: a rounded input with only three controls — attach (+), voice (when the device
 * supports it) and send.
 */
export function Composer({ onSend, onAttach, busy, large, autoFocus, placeholder = "Describe how you're feeling..." }: { onSend: (t: string) => void; onAttach: () => void; busy: boolean; large?: boolean; autoFocus?: boolean; placeholder?: string }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const voice = useSyncExternalStore(
    () => () => {},
    () => getVoiceInput(),
    () => null,
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(180, el.scrollHeight) + "px";
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    stopRef.current?.();
    onSend(t);
    setText("");
  };

  const toggleVoice = () => {
    if (!voice) return;
    if (listening) {
      stopRef.current?.();
      return;
    }
    const base = text ? text + " " : "";
    setListening(true);
    stopRef.current = voice.start({
      onText: (t) => setText(base + t),
      onEnd: () => {
        setListening(false);
        stopRef.current = null;
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn("flex items-end gap-1 rounded-[var(--radius-composer)] border border-line bg-surface p-1.5 shadow-[var(--shadow-composer)] transition-shadow focus-within:border-primary/60 focus-within:shadow-[0_0_0_4px_rgba(61,131,223,0.12)]", large && "p-2")}
    >
      <button type="button" onClick={onAttach} className="inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-ink" aria-label="Add a photo or report">
        <Plus className="h-[22px] w-[22px]" />
      </button>
      <label htmlFor="composer" className="sr-only">
        Describe how you&apos;re feeling
      </label>
      <textarea
        id="composer"
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        enterKeyHint="send"
        placeholder={placeholder}
        className={cn("block min-h-11 min-w-0 flex-1 resize-none bg-transparent px-0.5 py-[11px] text-[16px] leading-[22px] placeholder:text-muted focus:outline-none", large && "min-h-12 py-[13px]")}
        maxLength={4000}
      />
      {voice && !text.trim() && (
        <button type="button" onClick={toggleVoice} className={cn("inline-flex h-11 w-10 shrink-0 items-center justify-center rounded-full hover:bg-subtle", listening ? "bg-danger-bg text-danger" : "text-muted")} aria-label={listening ? "Stop voice input" : "Speak instead of typing"} aria-pressed={listening}>
          {listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-[21px] w-[21px]" />}
        </button>
      )}
      {(text.trim() || !voice) && (
        <button type="submit" disabled={!text.trim() || busy} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover disabled:bg-subtle disabled:text-muted" aria-label="Send message">
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </form>
  );
}
