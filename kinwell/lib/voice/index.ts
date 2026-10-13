/**
 * Voice input abstraction. The MVP uses the browser's Web Speech API when available; a cloud speech
 * provider can implement the same interface later. Voice is always optional — typing and tapping work everywhere.
 */
export interface VoiceInputProvider {
  readonly name: string;
  /** Starts listening; returns a function that stops it. */
  start(handlers: { onText: (text: string) => void; onEnd: () => void }): () => void;
}

type SpeechRecognitionLike = {
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  interimResults: boolean;
  lang: string;
  continuous: boolean;
};
type Ctor = new () => SpeechRecognitionLike;

class WebSpeechVoiceInput implements VoiceInputProvider {
  readonly name = "web-speech";
  constructor(private readonly Recognition: Ctor) {}
  start({ onText, onEnd }: { onText: (text: string) => void; onEnd: () => void }) {
    const r = new this.Recognition();
    r.lang = navigator.language || "en-IN";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0]!.transcript).join(""));
    r.onend = onEnd;
    r.onerror = onEnd;
    r.start();
    return () => r.stop();
  }
}

let cached: VoiceInputProvider | null | undefined;

/** Returns the same provider instance on every call (safe for useSyncExternalStore), or null if unsupported. */
export function getVoiceInput(): VoiceInputProvider | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  cached = R ? new WebSpeechVoiceInput(R) : null;
  return cached;
}
