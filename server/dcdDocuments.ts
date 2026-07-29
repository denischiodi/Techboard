import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import PDFDocument from "pdfkit";

export type DcdDocumentContext = {
  projectName: string;
  module: string;
  title: string;
  version: number;
  status: string;
  author: string;
  generatedAt: Date;
  templateName?: string;
  versionReason?: string;
};

const BLUE = "082B67";
const GRAY = "D9D9D9";
const border = { style: BorderStyle.SINGLE, size: 4, color: "9E9E9E" };
const borders = { top: border, bottom: border, left: border, right: border };

function cleanInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(`{1,3}|\*\*|__|\*|_)/g, "")
    .trim();
}

function bodyParagraph(value: string, bold = false) {
  return new Paragraph({
    spacing: { after: 100, line: 280 },
    children: [
      new TextRun({
        text: cleanInline(value),
        bold,
        font: "Calibri",
        size: 21,
      }),
    ],
  });
}

function metadataTable(context: DcdDocumentContext) {
  const rows = [
    ["Projeto", context.projectName],
    ["Módulo", context.module],
    ["Documento", context.title],
    ["Versão / Status", `v${context.version} / ${context.status}`],
    ["Autor", context.author],
    ["Gerado em", context.generatedAt.toLocaleString("pt-BR")],
    ["Modelo", context.templateName || "DCD V5"],
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2300, 7060],
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 2300, type: WidthType.DXA },
              borders,
              shading: { fill: GRAY, type: ShadingType.CLEAR },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [bodyParagraph(label, true)],
            }),
            new TableCell({
              width: { size: 7060, type: WidthType.DXA },
              borders,
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: [bodyParagraph(value || "Não informado")],
            }),
          ],
        })
    ),
  });
}

function markdownChildren(markdown: string) {
  const children: Array<Paragraph | Table> = [];
  const lines = markdown.replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const heading = raw.match(/^(#{1,3})\s+(.+)$/);
    const bullet = raw.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = raw.match(/^\s*\d+[.)]\s+(.+)$/);
    if (heading) {
      children.push(
        new Paragraph({
          heading:
            heading[1].length === 1
              ? HeadingLevel.HEADING_1
              : heading[1].length === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before: 220, after: 100 },
          children: [
            new TextRun({
              text: cleanInline(heading[2]),
              bold: true,
              color: BLUE,
            }),
          ],
        })
      );
    } else if (bullet || numbered) {
      children.push(
        new Paragraph({
          numbering: {
            reference: bullet ? "dcd-bullets" : "dcd-numbers",
            level: 0,
          },
          spacing: { after: 70 },
          children: [
            new TextRun({
              text: cleanInline((bullet || numbered)![1]),
              font: "Calibri",
              size: 21,
            }),
          ],
        })
      );
    } else if (raw.trim() && !/^\s*\|?[-:| ]+\|\s*$/.test(raw)) {
      children.push(
        bodyParagraph(raw.replace(/^\||\|$/g, "").replace(/\s*\|\s*/g, " | "))
      );
    }
  }
  return children;
}

export async function generateDcdDocx(
  context: DcdDocumentContext,
  markdown: string
) {
  const watermark =
    context.status === "Aprovado"
      ? []
      : [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: `${context.status.toUpperCase()} — DOCUMENTO NÃO APROVADO`,
                bold: true,
                color: "B42318",
                size: 22,
              }),
            ],
          }),
        ];
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "dcd-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 520, hanging: 240 } } },
            },
          ],
        },
        {
          reference: "dcd-numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 520, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 21 },
          paragraph: { spacing: { after: 100, line: 280 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 1440,
              right: 720,
              bottom: 1440,
              left: 1440,
              header: 720,
              footer: 720,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Documento de projeto — uso controlado     ",
                    color: "808080",
                    size: 16,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: "808080",
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: "DESIGN DE CONFIGURAÇÃO DETALHADA",
                bold: true,
                color: BLUE,
                size: 30,
              }),
            ],
          }),
          ...watermark,
          metadataTable(context),
          new Paragraph({ spacing: { after: 120 } }),
          ...markdownChildren(markdown),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function generateDcdPdf(
  context: DcdDocumentContext,
  markdown: string
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 54, right: 54 },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const complete = new Promise<Buffer>(resolve =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );
  doc
    .fillColor(`#${BLUE}`)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text("DESIGN DE CONFIGURAÇÃO DETALHADA", { align: "center" });
  doc.moveDown(0.5);
  if (context.status !== "Aprovado")
    doc
      .fillColor("#B42318")
      .fontSize(10)
      .text(`${context.status.toUpperCase()} — DOCUMENTO NÃO APROVADO`, {
        align: "center",
      });
  doc.moveDown();
  const meta = [
    ["Projeto", context.projectName],
    ["Módulo", context.module],
    ["Documento", context.title],
    ["Versão / Status", `v${context.version} / ${context.status}`],
    ["Autor", context.author],
    ["Modelo", context.templateName || "DCD V5"],
  ];
  for (const [label, value] of meta) {
    doc
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(value || "Não informado");
  }
  doc.moveDown();
  for (const raw of markdown.replace(/\r/g, "").split("\n")) {
    const heading = raw.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      doc
        .moveDown(0.5)
        .fillColor(`#${BLUE}`)
        .font("Helvetica-Bold")
        .fontSize(
          heading[1].length === 1 ? 15 : heading[1].length === 2 ? 13 : 11
        )
        .text(cleanInline(heading[2]));
    } else if (raw.trim()) {
      doc
        .fillColor("#111827")
        .font("Helvetica")
        .fontSize(9.5)
        .text(cleanInline(raw.replace(/^\s*[-*+]\s+/, "• ")), { lineGap: 2 });
    } else doc.moveDown(0.35);
  }
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(index);
    doc
      .fillColor("#808080")
      .font("Helvetica")
      .fontSize(8)
      .text(`Página ${index + 1} de ${range.count}`, 54, doc.page.height - 35, {
        align: "center",
        width: doc.page.width - 108,
        lineBreak: false,
      });
  }
  doc.end();
  return complete;
}
