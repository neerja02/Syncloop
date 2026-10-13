import "server-only";

export interface ImageQuality {
  score: number; // 0..1
  readable: boolean;
  issues: string[];
  width: number | null;
  height: number | null;
  sharpness: number | null;
  brightness: number | null;
  contrast: number | null;
}

/**
 * Measures basic image quality: resolution, brightness, contrast and sharpness (variance of a Laplacian).
 * Used to decide whether we ask for a clearer copy *before* trusting any extracted values.
 */
export async function assessImageQuality(buffer: Buffer): Promise<ImageQuality> {
  const sharp = (await import("sharp")).default;
  const img = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const grey = img.clone().greyscale().resize({ width: 1000, withoutEnlargement: true });
  const stats = await grey.clone().stats();
  const brightness = stats.channels[0]!.mean / 255;
  const contrast = stats.channels[0]!.stdev / 128;
  const lap = await grey
    .clone()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .stats();
  const sharpness = lap.channels[0]!.stdev;

  const issues: string[] = [];
  const width = meta.width ?? null;
  const height = meta.height ?? null;
  if ((width ?? 0) < 600 || (height ?? 0) < 600) issues.push("Low resolution");
  if (brightness < 0.25) issues.push("Too dark");
  if (brightness > 0.92) issues.push("Overexposed or glare");
  if (contrast < 0.18) issues.push("Low contrast");
  if (sharpness < 6) issues.push("Blurry");

  const score = Math.max(0, Math.min(1, 1 - issues.length * 0.22));
  return { score, readable: !issues.includes("Blurry") && score >= 0.5, issues, width, height, sharpness, brightness, contrast };
}

/**
 * Produces an enhanced *copy* for readability (auto-rotate by EXIF, normalise contrast, gentle sharpen).
 * The original upload is always preserved separately; enhanced copies are never used to create clinical values
 * that are not present in the original.
 */
export async function enhanceForReading(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string; steps: string[] } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 2200, withoutEnlargement: true })
      .normalise()
      .sharpen({ sigma: 1 })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { buffer: out, mimeType: "image/jpeg", steps: ["auto-rotate", "contrast normalisation", "sharpen"] };
  } catch {
    return null; // e.g. HEIC without decoder support — original is still stored
  }
}

export async function makeThumbnail(buffer: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer, { failOn: "none" }).rotate().resize({ width: 360, height: 480, fit: "cover" }).jpeg({ quality: 72 }).toBuffer();
  } catch {
    return null;
  }
}
