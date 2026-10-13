import "server-only";
import type { AIProvider } from "../providers";
import type { AgentResult } from "../agents/context";
import { HEALTH_AGENT_STYLE_RULES } from "../prompts/health-agent";

const SYSTEM = `You are the voice of Kinwell, a calm family-health assistant.
Rewrite DRAFT into a warm, clear reply of at most 120 words for the person described.
Rules:
- Use only facts present in DRAFT or FACTS. Do not add any medicine names, doses, numbers, diagnoses or doctor instructions that are not in them.
- Keep every number exactly as written.
- Never claim certainty; this is not a diagnosis.
- Do not mention JSON, agents, or internal systems.
- Plain text only, no markdown headings.
${HEALTH_AGENT_STYLE_RULES}`;

/**
 * Converts structured agent output into conversational text. With a real LLM the draft is polished, then
 * verified: if the model introduced any number that wasn't in the draft/facts, the deterministic draft is used.
 */
export async function composeReply(ai: AIProvider, result: AgentResult, audience: string): Promise<{ text: string; polished: boolean }> {
  if (ai.isMock || result.lockText || result.text.length < 40) return { text: result.text, polished: false };
  const facts = JSON.stringify({ summary: result.response.summary, recommendations: result.response.recommendations, redFlags: result.response.redFlags });
  try {
    const out = await ai.chat({ system: SYSTEM, messages: [{ role: "user", content: `AUDIENCE: ${audience}\nFACTS: ${facts}\nDRAFT: ${result.text}` }], maxTokens: 600 });
    if (!out || !numbersPreserved(out, result.text + " " + facts)) return { text: result.text, polished: false };
    return { text: out, polished: true };
  } catch {
    return { text: result.text, polished: false };
  }
}

export function numbersPreserved(candidate: string, source: string) {
  const nums = (s: string) => new Set((s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
  const allowed = nums(source);
  for (const n of nums(candidate)) if (!allowed.has(n)) return false;
  return true;
}
