import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { User } from "./auth";
import type { ProfileData } from "./profile";

export class UnsupportedTextError extends Error {}

/**
 * Server-side PDF using built-in Helvetica (WinAnsi only). Text outside that set (e.g. Arabic)
 * cannot be rendered correctly without an embedded font + bidi shaping, so we refuse instead of
 * emitting a broken file; the printable HTML view handles those cases.
 */
export async function buildCvPdf(user: Pick<User, "name" | "email">, p: ProfileData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 50;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const check = (s: string) => {
    try { font.encodeText(s); } catch { throw new UnsupportedTextError("CV contains characters the PDF font cannot render"); }
  };
  const wrap = (text: string, f: PDFFont, size: number): string[] => {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) > W - 2 * M && line) { lines.push(line); line = word; } else line = t;
      }
      lines.push(line);
    }
    return lines;
  };
  const write = (text: string, f: PDFFont = font, size = 10, gap = 4) => {
    if (!text) return;
    check(text);
    for (const l of wrap(text, f, size)) {
      if (y < M + size) { page = doc.addPage([W, H]); y = H - M; }
      if (l) page.drawText(l, { x: M, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= size + gap;
    }
  };
  const heading = (s: string) => { y -= 6; write(s.toUpperCase(), bold, 11, 4); };

  write(user.name, bold, 20, 6);
  if (p.headline) write(p.headline, font, 12);
  write([user.email, p.phone, p.location].filter(Boolean).join("  |  "));
  if (p.summary) { heading("Summary"); write(p.summary); }
  if (p.skills.length) { heading("Skills"); write(p.skills.join(", ")); }
  if (p.experience.length) {
    heading("Experience");
    for (const e of p.experience) {
      write(`${e.title}${e.company ? ` - ${e.company}` : ""}`, bold);
      write(`${e.from}${e.to ? ` to ${e.to}` : " to present"}`);
      if (e.details) write(e.details);
      y -= 4;
    }
  }
  if (p.education.length) {
    heading("Education");
    for (const e of p.education) write(`${e.degree ? `${e.degree}, ` : ""}${e.school}${e.year ? ` (${e.year})` : ""}`);
  }
  return doc.save();
}
