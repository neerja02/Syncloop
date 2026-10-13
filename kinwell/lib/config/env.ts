import "server-only";

/** Central, typed access to environment configuration. Every integration falls back to a development mock. */
export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-insecure-session-secret-change-me",
  storageSigningSecret: process.env.STORAGE_SIGNING_SECRET ?? process.env.SESSION_SECRET ?? "dev-only-insecure-storage-secret",
  cronSecret: process.env.CRON_SECRET ?? "",
  authProvider: (process.env.AUTH_PROVIDER ?? "local") as "local" | "supabase",
  aiProvider: (process.env.AI_PROVIDER ?? "mock") as "mock" | "anthropic" | "openai",
  aiModel: process.env.AI_MODEL,
  embeddingProvider: (process.env.EMBEDDING_PROVIDER ?? "mock") as "mock" | "openai",
  ocrProvider: (process.env.OCR_PROVIDER ?? "local") as "local" | "google" | "azure" | "aws",
  storageProvider: (process.env.STORAGE_PROVIDER ?? "local") as "local" | "supabase",
  weatherProvider: (process.env.WEATHER_PROVIDER ?? "mock") as "mock" | "open-meteo",
  providerSearch: (process.env.PROVIDER_SEARCH_PROVIDER ?? "mock") as "mock" | "google",
  medicationTerminology: (process.env.MEDICATION_TERMINOLOGY_PROVIDER ?? "local") as "local" | "rxnav",
  clinicalTerminology: (process.env.CLINICAL_TERMINOLOGY_PROVIDER ?? "local") as "local" | "snomed",
  emailProvider: (process.env.EMAIL_PROVIDER ?? "dev-mailbox") as "dev-mailbox" | "resend",
  keys: {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    googleDocumentAi: process.env.GOOGLE_DOCUMENT_AI_KEY,
    azureDocumentIntelligence: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
    azureDocumentIntelligenceEndpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    weather: process.env.WEATHER_API_KEY,
    maps: process.env.MAPS_API_KEY,
    clinicalTerminology: process.env.CLINICAL_TERMINOLOGY_API_KEY,
    medicationTerminology: process.env.MEDICATION_TERMINOLOGY_API_KEY,
    resend: process.env.RESEND_API_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  storageDir: process.env.LOCAL_STORAGE_DIR ?? ".data/storage",
};

export function isMockMode(kind: "ai" | "ocr" | "weather" | "providers" | "embeddings") {
  switch (kind) {
    case "ai":
      return env.aiProvider === "mock" || (env.aiProvider === "anthropic" && !env.keys.anthropic) || (env.aiProvider === "openai" && !env.keys.openai);
    case "ocr":
      return env.ocrProvider === "local";
    case "weather":
      return env.weatherProvider === "mock";
    case "providers":
      return env.providerSearch === "mock" || !env.keys.maps;
    case "embeddings":
      return env.embeddingProvider === "mock" || !env.keys.openai;
  }
}
