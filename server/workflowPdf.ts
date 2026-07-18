type PdfLine = { text: string; size: number; bold?: boolean; gapBefore?: number };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function latin1(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .split("")
    .map(character => character.charCodeAt(0) <= 255 ? character : "?")
    .join("");
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(`{1,3}|\*\*|__|\*|_)/g, "")
    .trim();
}

function wrapText(text: string, size: number, prefix = "") {
  const maxChars = Math.max(20, Math.floor(CONTENT_WIDTH / (size * 0.53)));
  const words = `${prefix}${stripInlineMarkdown(text)}`.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current || current.length + word.length + 1 <= maxChars) current += `${current ? " " : ""}${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function markdownToLines(markdown: string): PdfLine[] {
  const result: PdfLine[] = [];
  let inCode = false;
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    if (raw.trim().startsWith("```")) { inCode = !inCode; continue; }
    const heading = raw.match(/^(#{1,4})\s+(.+)$/);
    const bullet = raw.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = raw.match(/^\s*(\d+[.)])\s+(.+)$/);
    if (heading) {
      const size = heading[1].length === 1 ? 17 : heading[1].length === 2 ? 14 : 12;
      wrapText(heading[2], size).forEach((text, index) => result.push({ text, size, bold: true, gapBefore: index ? 0 : 8 }));
    } else if (bullet) {
      wrapText(bullet[1], 10.5, "- ").forEach(text => result.push({ text, size: 10.5 }));
    } else if (numbered) {
      wrapText(numbered[2], 10.5, `${numbered[1]} `).forEach(text => result.push({ text, size: 10.5 }));
    } else if (/^\s*\|.*\|\s*$/.test(raw)) {
      if (!/^\s*\|?\s*:?-+/.test(raw)) wrapText(raw.replace(/^\s*\||\|\s*$/g, "").replace(/\s*\|\s*/g, " | "), 9).forEach(text => result.push({ text, size: 9 }));
    } else if (!raw.trim()) result.push({ text: "", size: 6 });
    else wrapText(raw, inCode ? 9 : 10.5).forEach(text => result.push({ text, size: inCode ? 9 : 10.5 }));
  }
  return result;
}

function pageStream(title: string, lines: PdfLine[], pageNumber: number, totalPages: number) {
  const commands: string[] = [
    "0.12 0.18 0.28 rg",
    `BT /F2 9 Tf ${MARGIN} ${PAGE_HEIGHT - 35} Td (${pdfEscape(latin1(title))}) Tj ET`,
    "0.55 0.6 0.68 RG 0.5 w",
    `${MARGIN} ${PAGE_HEIGHT - 44} m ${PAGE_WIDTH - MARGIN} ${PAGE_HEIGHT - 44} l S`,
  ];
  let y = PAGE_HEIGHT - 66;
  for (const line of lines) {
    y -= line.gapBefore || 0;
    if (line.text) commands.push(`0.08 0.1 0.14 rg BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${MARGIN} ${y} Td (${pdfEscape(latin1(line.text))}) Tj ET`);
    y -= Math.max(10, line.size * 1.38);
  }
  commands.push(`0.4 0.45 0.52 rg BT /F1 8 Tf ${PAGE_WIDTH / 2 - 20} 28 Td (Pagina ${pageNumber} de ${totalPages}) Tj ET`);
  return commands.join("\n");
}

export function generateWorkflowPdf(title: string, markdown: string) {
  const allLines = markdownToLines(markdown);
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let used = 0;
  for (const line of allLines) {
    const height = (line.gapBefore || 0) + Math.max(10, line.size * 1.38);
    if (page.length && used + height > PAGE_HEIGHT - 125) { pages.push(page); page = []; used = 0; }
    page.push(line); used += height;
  }
  pages.push(page.length ? page : [{ text: "Documento sem conteudo", size: 10.5 }]);

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((lines, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const stream = pageStream(title, lines, index + 1, pages.length);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  let output = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}
