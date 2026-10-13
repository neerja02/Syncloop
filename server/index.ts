import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.ELEVENLABS_API_KEY || "";
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || "agent_8401m4vje8w3fdjajg1v11y7z1ef";

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, voice: API_KEY ? "ready" : "missing ELEVENLABS_API_KEY", agentId: AGENT_ID });
});

/**
 * Returns a short-lived signed URL for a live voice conversation with Nia.
 * The ElevenLabs API key stays here on the server and never reaches the browser.
 */
app.get("/api/asha/signed-url", async (_req, res) => {
  if (!API_KEY) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY is not set. Add it to the .env file and restart." });
    return;
  }
  try {
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(AGENT_ID)}`;
    const r = await fetch(url, { headers: { "xi-api-key": API_KEY } });
    const body = (await r.json().catch(() => ({}))) as { signed_url?: string; detail?: { message?: string } | string };
    if (!r.ok || !body.signed_url) {
      res.status(502).json({ error: (typeof body.detail === "string" ? body.detail : body.detail?.message) || `ElevenLabs returned ${r.status}` });
      return;
    }
    res.json({ signedUrl: body.signed_url });
  } catch (e) {
    res.status(502).json({ error: `Could not reach ElevenLabs: ${(e as Error).message}` });
  }
});

/**
 * Speaks a line in Nia's voice (Zara) for the offline call, so it sounds the same as the live agent.
 * The browser's built-in voice is only used when this isn't available.
 */
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "OtEfb2LVzIE45wdYe54M";
app.post("/api/tts", express.json({ limit: "8kb" }), async (req, res) => {
  const text = String((req.body as { text?: string })?.text || "").slice(0, 600);
  if (!API_KEY || !text.trim()) {
    res.status(API_KEY ? 400 : 503).json({ error: API_KEY ? "No text" : "ELEVENLABS_API_KEY is not set" });
    return;
  }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!r.ok) {
      res.status(502).json({ error: `ElevenLabs returned ${r.status}` });
      return;
    }
    res.set("Content-Type", "audio/mpeg").send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/* ---------------- SOS: emergency call + WhatsApp to the family ---------------- */

const TW_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TW_CALL_FROM = process.env.TWILIO_CALL_FROM || "";
const TW_WA_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const canCall = !!(TW_SID && TW_TOKEN && TW_CALL_FROM);
const canWhatsApp = !!(TW_SID && TW_TOKEN && TW_WA_FROM);

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const e164 = (phone: string) => {
  const d = String(phone).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.length === 10) return `+91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `+91${d.slice(1)}`;
  return `+${d}`;
};

async function twilio(resource: "Calls" | "Messages", params: Record<string, string>) {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/${resource}.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await r.json().catch(() => ({}))) as { message?: string };
  if (!r.ok) throw new Error(body.message || `Twilio returned ${r.status}`);
}

// A public SOS route can be abused to place calls, so cap how often it fires.
const sosTimes: number[] = [];

app.get("/api/emergency/status", (_req, res) => res.json({ call: canCall, whatsapp: canWhatsApp }));

app.post("/api/emergency", express.json({ limit: "20kb" }), async (req, res) => {
  const now = Date.now();
  while (sosTimes.length && now - sosTimes[0] > 10 * 60_000) sosTimes.shift();
  if (sosTimes.length >= 5) {
    res.status(429).json({ error: "Too many SOS requests. Please call directly." });
    return;
  }
  sosTimes.push(now);

  const { patient = "", patientPhone = "", message = "", contacts = [] } = (req.body ?? {}) as {
    patient?: string; patientPhone?: string; message?: string; contacts?: { name?: string; phone?: string }[];
  };
  const list = (Array.isArray(contacts) ? contacts : []).filter((c) => c?.phone).slice(0, 3);
  const spoken =
    `Emergency. ${patient} ji ne Sister Nia app mein S O S button dabaya hai. Unhe abhi madad chahiye. ` +
    `Turant unhe call kijiye${patientPhone ? `, unka number hai ${String(patientPhone).split("").join(" ")}` : ""}. WhatsApp par location bheji gayi hai.`;
  const twiml = `<Response><Say voice="Polly.Aditi" language="hi-IN">${xml(spoken)}</Say><Pause length="1"/><Say voice="Polly.Aditi" language="hi-IN">${xml(spoken)}</Say></Response>`;

  const results = await Promise.all(
    list.map(async (c) => {
      const to = e164(c.phone!);
      const out = { name: c.name || to, call: "not_configured", whatsapp: "not_configured" } as { name: string; call: string; whatsapp: string };
      if (canCall) out.call = await twilio("Calls", { To: to, From: TW_CALL_FROM, Twiml: twiml }).then(() => "placed", (e: Error) => `failed: ${e.message}`);
      if (canWhatsApp) out.whatsapp = await twilio("Messages", { To: `whatsapp:${to}`, From: TW_WA_FROM.startsWith("whatsapp:") ? TW_WA_FROM : `whatsapp:${TW_WA_FROM}`, Body: String(message).slice(0, 1500) }).then(() => "sent", (e: Error) => `failed: ${e.message}`);
      return out;
    }),
  );
  res.json({ configured: { call: canCall, whatsapp: canWhatsApp }, results });
});

// In production, serve the built React app from /dist.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`SOS: calls ${canCall ? "via Twilio" : "open the phone dialer (add TWILIO_* to .env for automatic calls)"}, WhatsApp ${canWhatsApp ? "via Twilio" : "opens WhatsApp"}`);
  console.log(`Sister Nia API on http://localhost:${PORT}  (voice: ${API_KEY ? "ready" : "add ELEVENLABS_API_KEY to .env"})`);
  if (existsSync(dist)) console.log(`Serving the app at http://localhost:${PORT}`);
});
