import "server-only";
import { env } from "@/lib/config/env";
import { assessImageQuality, type ImageQuality } from "@/lib/services/image-processing";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecognizedLine {
  text: string;
  confidence: number;
  page: number;
  boundingBox?: BoundingBox;
}

export interface RecognitionResult {
  provider: string;
  isMock: boolean;
  pageCount: number;
  text: string;
  lines: RecognizedLine[];
  quality: ImageQuality;
}

export interface RecognitionInput {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/** Vendor-neutral document recognition interface (OCR + layout). */
export interface DocumentRecognitionProvider {
  readonly name: string;
  recognize(input: RecognitionInput): Promise<RecognitionResult>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string, envVar: string) {
    super(`${provider} is not configured. Set ${envVar} or switch OCR_PROVIDER=local for development.`);
  }
}

function textToLines(text: string, page = 1, baseConfidence = 0.99): RecognizedLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({
      text: t,
      // Characters a recogniser could not resolve ("?", "□", "�") make that line low confidence.
      confidence: /[?□�]/.test(t.replace(/\?\s*$/, "")) ? 0.42 : baseConfidence,
      page,
      boundingBox: { x: 0.05, y: Math.min(0.95, 0.05 + i * 0.03), width: 0.9, height: 0.025 },
    }));
}

const GOOD_QUALITY: ImageQuality = { score: 1, readable: true, issues: [], width: null, height: null, sharpness: null, brightness: null, contrast: null };

/** Demo text returned for photographed documents when no OCR vendor is configured. Clearly flagged as mock. */
const DEMO_LAB_TEXT = `CityCare Diagnostics (DEMO)
Patient: [as uploaded]
Date: 18/09/2026
Test Result Unit Reference Range
HbA1c 7.2 % 4.0 - 5.6
Fasting Blood Glucose 132 mg/dL 70 - 99
Haemoglobin 13.1 g/dL 12.0 - 15.5
Total Cholesterol 196 mg/dL < 200
LDL Cholesterol 118 mg/dL < 100
Creatinine 0.9 mg/dL 0.6 - 1.2`;

const DEMO_PRESCRIPTION_TEXT = `Sharma Family Clinic (DEMO)
Date: 20/09/2026
Rx
Tab Metfornin 500 mg twice daily after meals
Tab Telma 40 mg once daily in the morning
Review after 3 months`;

/**
 * Local development provider.
 * - Plain text and PDFs with a text layer are read for real.
 * - DOCX files are read for real.
 * - Photos/scans need an OCR engine: in development a clearly-labelled DEMO text is returned, and the image's
 *   real quality metrics decide whether a value is shown as unreadable (we never invent a missing digit).
 */
export class LocalDocumentRecognitionProvider implements DocumentRecognitionProvider {
  readonly name = "local";

  async recognize({ buffer, mimeType, filename }: RecognitionInput): Promise<RecognitionResult> {
    if (mimeType === "text/plain") {
      const text = buffer.toString("utf8");
      return { provider: this.name, isMock: false, pageCount: 1, text, lines: textToLines(text), quality: GOOD_QUALITY };
    }
    if (mimeType === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const pages = text as string[];
      const joined = pages.join("\n").trim();
      if (joined.length > 20) {
        return {
          provider: this.name,
          isMock: false,
          pageCount: totalPages,
          text: joined,
          lines: pages.flatMap((p, i) => textToLines(p.replace(/ {2,}/g, "\n"), i + 1, 0.98)),
          quality: GOOD_QUALITY,
        };
      }
      // Scanned PDF without a text layer → treat like an image.
      return this.mockImage(filename, { ...GOOD_QUALITY, issues: ["Scanned PDF without a text layer"] }, totalPages);
    }
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return { provider: this.name, isMock: false, pageCount: 1, text: value, lines: textToLines(value), quality: GOOD_QUALITY };
    }
    if (mimeType.startsWith("image/")) {
      const quality = await assessImageQuality(buffer).catch(() => ({ ...GOOD_QUALITY, issues: ["Image format could not be analysed (HEIC previews may be unsupported)"] }));
      return this.mockImage(filename, quality, 1);
    }
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  private mockImage(filename: string, quality: ImageQuality, pageCount: number): RecognitionResult {
    const lower = filename.toLowerCase();
    let text = /prescription|rx|medicine|label/.test(lower) ? DEMO_PRESCRIPTION_TEXT : DEMO_LAB_TEXT;
    const poor = !quality.readable || /blur|unclear|poor|unreadable/.test(lower);
    if (poor) {
      // Simulate what a recogniser returns for a smudged digit. The pipeline must NOT guess it.
      text = text.replace("HbA1c 7.2 %", "HbA1c 7.? %").replace("Fasting Blood Glucose 132", "Fasting Blood Glucose 1?2");
    }
    return {
      provider: `${this.name}-demo-ocr`,
      isMock: true,
      pageCount,
      text,
      lines: textToLines(text, 1, poor ? 0.83 : 0.96),
      quality: poor ? { ...quality, readable: quality.readable && !/blur|unclear|poor|unreadable/.test(lower), issues: [...quality.issues, ...(quality.issues.length ? [] : ["Some characters could not be read reliably"])] } : quality,
    };
  }
}

/** Azure AI Document Intelligence (prebuilt-read) adapter. */
export class AzureDocumentRecognitionProvider implements DocumentRecognitionProvider {
  readonly name = "azure-document-intelligence";
  async recognize({ buffer, mimeType }: RecognitionInput): Promise<RecognitionResult> {
    const key = env.keys.azureDocumentIntelligence;
    const endpoint = env.keys.azureDocumentIntelligenceEndpoint;
    if (!key || !endpoint) throw new ProviderNotConfiguredError("Azure Document Intelligence", "AZURE_DOCUMENT_INTELLIGENCE_KEY / AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT");
    const start = await fetch(`${endpoint.replace(/\/$/, "")}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": mimeType },
      body: new Uint8Array(buffer),
    });
    if (start.status !== 202) throw new Error(`Azure analyze failed: ${start.status}`);
    const opUrl = start.headers.get("operation-location")!;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const poll = await fetch(opUrl, { headers: { "Ocp-Apim-Subscription-Key": key } });
      const json = (await poll.json()) as {
        status: string;
        analyzeResult?: { content: string; pages: { pageNumber: number; width: number; height: number; lines: { content: string; polygon: number[] }[]; words: { confidence: number; content: string }[] }[] };
      };
      if (json.status === "succeeded" && json.analyzeResult) {
        const pages = json.analyzeResult.pages;
        const lines: RecognizedLine[] = pages.flatMap((p) => {
          const avg = p.words.length ? p.words.reduce((s, w) => s + w.confidence, 0) / p.words.length : 0.9;
          return p.lines.map((l) => {
            const xs = l.polygon.filter((_, i) => i % 2 === 0);
            const ys = l.polygon.filter((_, i) => i % 2 === 1);
            return {
              text: l.content,
              confidence: avg,
              page: p.pageNumber,
              boundingBox: { x: Math.min(...xs) / p.width, y: Math.min(...ys) / p.height, width: (Math.max(...xs) - Math.min(...xs)) / p.width, height: (Math.max(...ys) - Math.min(...ys)) / p.height },
            };
          });
        });
        return { provider: this.name, isMock: false, pageCount: pages.length, text: json.analyzeResult.content, lines, quality: GOOD_QUALITY };
      }
      if (json.status === "failed") throw new Error("Azure analysis failed");
    }
    throw new Error("Azure analysis timed out");
  }
}

/** Google Document AI adapter placeholder. */
export class GoogleDocumentAIRecognitionProvider implements DocumentRecognitionProvider {
  readonly name = "google-document-ai";
  async recognize(): Promise<RecognitionResult> {
    // TODO(production): POST to https://{location}-documentai.googleapis.com/v1/projects/{project}/locations/{location}/processors/{id}:process
    // using a service-account access token, then map document.pages[].lines[].layout (confidence + boundingPoly) to RecognizedLine.
    throw new ProviderNotConfiguredError("Google Document AI", "GOOGLE_DOCUMENT_AI_KEY / GOOGLE_DOCUMENT_AI_PROCESSOR");
  }
}

/** AWS Textract adapter placeholder. */
export class AwsTextractRecognitionProvider implements DocumentRecognitionProvider {
  readonly name = "aws-textract";
  async recognize(): Promise<RecognitionResult> {
    // TODO(production): use @aws-sdk/client-textract AnalyzeDocument (FORMS, TABLES) and map Blocks of type LINE.
    throw new ProviderNotConfiguredError("AWS Textract", "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY");
  }
}

export function getDocumentRecognition(): DocumentRecognitionProvider {
  switch (env.ocrProvider) {
    case "azure":
      return new AzureDocumentRecognitionProvider();
    case "google":
      return new GoogleDocumentAIRecognitionProvider();
    case "aws":
      return new AwsTextractRecognitionProvider();
    default:
      return new LocalDocumentRecognitionProvider();
  }
}
