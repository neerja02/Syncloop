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
 * Returns a short-lived signed URL for a live voice conversation with Asha.
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

// In production, serve the built React app from /dist.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Sister Asha API on http://localhost:${PORT}  (voice: ${API_KEY ? "ready" : "add ELEVENLABS_API_KEY to .env"})`);
  if (existsSync(dist)) console.log(`Serving the app at http://localhost:${PORT}`);
});
