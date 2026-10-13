/** Generates fictional sample files in ./samples for trying uploads (report PDF, blurry photo, prescription, guidance PDF). */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { paginate, simplePdf, wrapLines } from "@/lib/utils/simple-pdf";

const out = path.join(process.cwd(), "samples");
fs.mkdirSync(out, { recursive: true });

const lab = simplePdf([["CityCare Diagnostics (DEMO - fictional sample)", "Patient: Sample Person    Date: 25/09/2026", "Test Result Unit Reference Range", "HbA1c 6.9 % 4.0 - 5.6", "Fasting Blood Glucose 126 mg/dL 70 - 99", "Total Cholesterol 182 mg/dL < 200", "LDL Cholesterol 104 mg/dL < 100", "HDL Cholesterol 48 mg/dL > 40", "Creatinine 0.9 mg/dL 0.6 - 1.2", "TSH 2.2 mIU/L 0.4 - 4.0"]], { title: "Sample lab report" });
fs.writeFileSync(path.join(out, "sample-lab-report.pdf"), lab);

fs.writeFileSync(path.join(out, "sample-prescription.txt"), "Sharma Family Clinic (DEMO - fictional)\nDate: 26/09/2026\nRx\nTab Metfornin 500 mg twice daily after meals\nTab Amlodipin 5 mg once daily\nReview after 3 months\n");

const guidance = `# Gestational and type 2 diabetes — snacks guide (fictional)
Sharma Family Clinic (DEMO).

Healthy snacks between meals
Choose roasted chana, a small handful of nuts, buttermilk, or a fruit such as guava or apple instead of biscuits or sweets. Avoid fruit juice. Pair any fruit with a few nuts to slow the rise in blood sugar.

Evening hunger
If you feel hungry in the evening, a bowl of vegetable soup or sprouts salad is a good choice. Avoid fried namkeen.`;
fs.writeFileSync(path.join(out, "sample-doctor-guidance.pdf"), simplePdf(paginate(wrapLines(guidance)), { title: "Snacks guide" }));

const svg = (text: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="100%" height="100%" fill="#f4f1ea"/><g font-family="Helvetica" font-size="40" fill="#222">${text.split("\n").map((l, i) => `<text x="60" y="${120 + i * 70}">${l}</text>`).join("")}</g></svg>`);
const labText = "CityCare Diagnostics (DEMO)\nTest      Result   Unit\nHbA1c       7.2      %\nFasting Glucose  132  mg/dL\nHaemoglobin  13.1  g/dL";
await sharp(svg(labText)).jpeg({ quality: 85 }).toFile(path.join(out, "sample-lab-photo.jpg"));
await sharp(svg(labText)).blur(9).jpeg({ quality: 60 }).toFile(path.join(out, "sample-lab-photo-blurry.jpg"));
console.log("Sample files written to ./samples");
