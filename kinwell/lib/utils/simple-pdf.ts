/**
 * Minimal single/multi-page PDF writer (Helvetica, text lines only). Used to generate fictional demo reports
 * and sample files without extra dependencies. Not intended for general document generation.
 */
function esc(s: string) {
  return s.replace(/[\\()]/g, (c) => "\\" + c).replace(/[^\x20-\x7e]/g, "-");
}

export function simplePdf(pages: string[][], opts: { title?: string } = {}): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];
  const pagesIdPlaceholder = objects.length + 1 + pages.length * 2;
  for (const lines of pages) {
    let y = 800;
    const ops: string[] = ["BT"];
    lines.forEach((line, i) => {
      const heading = i === 0 || line.startsWith("# ");
      const text = line.replace(/^# /, "");
      ops.push(`/${heading ? "F2" : "F1"} ${heading ? 14 : 10.5} Tf`);
      ops.push(`1 0 0 1 50 ${y} Tm (${esc(text)}) Tj`);
      y -= heading ? 22 : 15;
    });
    ops.push("ET");
    const stream = ops.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesIdPlaceholder} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  if (pagesId !== pagesIdPlaceholder) throw new Error("PDF object numbering mismatch");
  const infoId = add(`<< /Title (${esc(opts.title ?? "Document")}) /Producer (Kinwell demo) >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Wraps long paragraphs into lines that fit the page. */
export function wrapLines(text: string, width = 95): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > width) {
        out.push(line.trim());
        line = word;
      } else line += " " + word;
    }
    out.push(line.trim());
  }
  return out;
}

export function paginate(lines: string[], perPage = 48): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  return pages.length ? pages : [[""]];
}
