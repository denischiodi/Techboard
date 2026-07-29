import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
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

export type MeetingMinutesData = {
  summary: string;
  participants: Array<{ name: string; company: string }>;
  topics: Array<{ title: string; items: string[] }>;
  decisions: string[];
  nextSteps: string[];
};

export type MeetingMinutesDocumentContext = {
  projectName: string;
  projectCode: string;
  costCode: string;
  costCodeDescription: string;
  client: string;
  seidorManager: string;
  clientManager: string;
  seidorExecutive: string;
  sponsor: string;
  clientLogoUrl?: string;
  workshopTitle: string;
  meetingDate: string;
  meetingTime: string;
  author: string;
  version: number;
  generatedAt: Date;
};

const BLUE = "082B67";
const LIGHT_GRAY = "D9D9D9";
const border = { style: BorderStyle.SINGLE, size: 4, color: "9E9E9E" };
const borders = { top: border, bottom: border, left: border, right: border };

function text(value: unknown) {
  return String(value || "").trim();
}

export function normalizeMeetingMinutesData(
  value: unknown
): MeetingMinutesData {
  const input = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const stringList = (item: unknown) =>
    Array.isArray(item) ? item.map(text).filter(Boolean) : [];
  const participants = Array.isArray(input.participants)
    ? input.participants
        .map(item => {
          if (typeof item === "string")
            return { name: text(item), company: "" };
          const row = (item || {}) as Record<string, unknown>;
          return { name: text(row.name), company: text(row.company) };
        })
        .filter(item => item.name)
    : [];
  const topics = Array.isArray(input.topics)
    ? input.topics
        .map(item => {
          const row = (item || {}) as Record<string, unknown>;
          return {
            title: text(row.title) || "Assunto",
            items: stringList(row.items),
          };
        })
        .filter(item => item.title || item.items.length)
    : [];
  return {
    summary: text(input.summary),
    participants,
    topics,
    decisions: stringList(input.decisions),
    nextSteps: stringList(input.nextSteps),
  };
}

function paragraph(
  value: string,
  options: {
    bold?: boolean;
    size?: number;
    color?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingAfter?: number;
  } = {}
) {
  return new Paragraph({
    alignment: options.alignment,
    spacing: { after: options.spacingAfter ?? 80 },
    children: [
      new TextRun({
        text: value,
        bold: options.bold,
        size: options.size ?? 20,
        color: options.color,
        font: "Arial",
      }),
    ],
  });
}

function labelCell(label: string, value: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: LIGHT_GRAY, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      paragraph(label, { bold: true, spacingAfter: 50 }),
      paragraph(value || " ", { spacingAfter: 0 }),
    ],
  });
}

function sectionTitle(title: string) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            shading: { fill: BLUE, type: ShadingType.CLEAR },
            margins: { top: 90, bottom: 90, left: 100, right: 100 },
            children: [
              paragraph(title, {
                bold: true,
                color: "FFFFFF",
                alignment: AlignmentType.CENTER,
                spacingAfter: 0,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function decodeDataImage(value?: string) {
  const match = value?.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  return {
    data: Buffer.from(match[2], "base64"),
    type: match[1].toLowerCase().startsWith("jp")
      ? ("jpg" as const)
      : ("png" as const),
  };
}

function header(context: MeetingMinutesDocumentContext) {
  const logo = decodeDataImage(context.clientLogoUrl);
  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [2200, 5200, 2200],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  paragraph("S E I D O R", {
                    bold: true,
                    color: "1267A5",
                    size: 25,
                    alignment: AlignmentType.CENTER,
                    spacingAfter: 0,
                  }),
                ],
              }),
              new TableCell({
                borders,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  paragraph("ATA DE REUNIÃO", {
                    bold: true,
                    size: 24,
                    alignment: AlignmentType.CENTER,
                    spacingAfter: 0,
                  }),
                ],
              }),
              new TableCell({
                borders,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  logo
                    ? new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new ImageRun({
                            data: logo.data,
                            type: logo.type,
                            transformation: { width: 95, height: 50 },
                          }),
                        ],
                      })
                    : paragraph(context.client || "CLIENTE", {
                        bold: true,
                        size: 20,
                        alignment: AlignmentType.CENTER,
                        spacingAfter: 0,
                      }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Documento de propriedade da SEIDOR e de seu PARCEIRO. Não pode ser reproduzido ou compartilhado sem autorização     ",
            color: "808080",
            size: 16,
            font: "Arial",
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            color: "808080",
            size: 16,
            font: "Arial",
          }),
        ],
      }),
    ],
  });
}

export async function generateMinutesDocx(
  context: MeetingMinutesDocumentContext,
  data: MeetingMinutesData
) {
  const listParagraph = (value: string, level = 0) =>
    new Paragraph({
      numbering: { reference: "minutes-bullets", level },
      spacing: { after: 60 },
      children: [new TextRun({ text: value, font: "Arial", size: 20 })],
    });
  const participants = data.participants.length
    ? data.participants
    : [{ name: "Não informado", company: "" }];
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "minutes-bullets",
          levels: [0, 1].map(level => ({
            level,
            format: LevelFormat.BULLET,
            text: level ? "○" : "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 520 + level * 360, hanging: 240 } },
            },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 20 },
          paragraph: { spacing: { after: 80, line: 260 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: 1440,
              right: 900,
              bottom: 900,
              left: 900,
              header: 420,
              footer: 420,
            },
          },
        },
        headers: { default: header(context) },
        footers: { default: footer() },
        children: [
          paragraph(" ", { spacingAfter: 140 }),
          sectionTitle("IDENTIFICAÇÃO DO PROJETO"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [4800, 4800],
            rows: [
              new TableRow({
                children: [
                  labelCell("Nome do Projeto", context.projectName, 4800),
                  labelCell(
                    "Código Controle Custo do Projeto (OI)",
                    [context.costCode, context.costCodeDescription]
                      .filter(Boolean)
                      .join(" — "),
                    4800
                  ),
                ],
              }),
              new TableRow({
                children: [
                  labelCell("Nome do Cliente", context.client, 4800),
                  labelCell("Código do Projeto", context.projectCode, 4800),
                ],
              }),
              new TableRow({
                children: [
                  labelCell(
                    "Gerente de Projeto da SEIDOR",
                    context.seidorManager,
                    4800
                  ),
                  labelCell(
                    "Gerente de Projeto do CLIENTE",
                    context.clientManager,
                    4800
                  ),
                ],
              }),
              new TableRow({
                children: [
                  labelCell(
                    "Executivo da SEIDOR Responsável pela Entrega",
                    context.seidorExecutive,
                    4800
                  ),
                  labelCell(
                    "Patrocinador do Projeto pelo CLIENTE",
                    context.sponsor,
                    4800
                  ),
                ],
              }),
            ],
          }),
          paragraph(" ", { spacingAfter: 80 }),
          sectionTitle("IDENTIFICAÇÃO DO DOCUMENTO"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  labelCell("Autor", context.author, 3200),
                  labelCell(
                    "Nome do Documento",
                    `${context.projectName}_ATA - ${context.workshopTitle}`,
                    4400
                  ),
                  labelCell("Localização do Documento", "TechBoard", 2000),
                ],
              }),
              new TableRow({
                children: [
                  labelCell("Versão", String(context.version), 2400),
                  labelCell(
                    "Data",
                    context.generatedAt.toLocaleDateString("pt-BR"),
                    2400
                  ),
                  labelCell(
                    "Situação",
                    context.version === 1 ? "Versão inicial" : "Atualização",
                    2400
                  ),
                  labelCell("Classificação", "Público", 2400),
                ],
              }),
            ],
          }),
          paragraph(" ", { spacingAfter: 80 }),
          sectionTitle("DADOS DA ATA DE REUNIÃO"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  labelCell("Data da Reunião", context.meetingDate, 4800),
                  labelCell(
                    "Hora Início da Reunião",
                    context.meetingTime,
                    4800
                  ),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders,
                    columnSpan: 2,
                    children: [
                      paragraph("Participantes", { bold: true }),
                      new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                          new TableRow({
                            tableHeader: true,
                            children: [
                              labelCell("NOME", "", 6000),
                              labelCell("EMPRESA", "", 3600),
                            ],
                          }),
                          ...participants.map(
                            item =>
                              new TableRow({
                                children: [
                                  labelCell("", item.name, 6000),
                                  labelCell("", item.company, 3600),
                                ],
                              })
                          ),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders,
                    columnSpan: 2,
                    margins: { top: 100, bottom: 100, left: 120, right: 120 },
                    children: [
                      paragraph("Objetivo da Reunião", { bold: true }),
                      paragraph(data.summary || context.workshopTitle),
                    ],
                  }),
                ],
              }),
            ],
          }),
          paragraph(" ", { spacingAfter: 100 }),
          paragraph("1.  ASSUNTOS DISCUTIDOS E/OU DEFINIÇÕES", {
            bold: true,
            size: 22,
            spacingAfter: 120,
          }),
          ...data.topics.flatMap(topic => [
            listParagraph(topic.title),
            ...topic.items.map(item => listParagraph(item, 1)),
          ]),
          ...(data.decisions.length
            ? [
                paragraph("Decisões tomadas", { bold: true, spacingAfter: 80 }),
                ...data.decisions.map(item => listParagraph(item, 1)),
              ]
            : []),
          paragraph("2.  PRÓXIMOS PASSOS", {
            bold: true,
            size: 22,
            spacingAfter: 100,
          }),
          ...(data.nextSteps.length
            ? data.nextSteps.map(item => listParagraph(item))
            : [paragraph("Não foram identificados próximos passos.")]),
          paragraph(" ", { spacingAfter: 120 }),
          sectionTitle("VALIDAÇÃO E APROVAÇÃO"),
          paragraph(
            "A revisão, validação e aprovação poderão ser feitas por E-Mail; todos os assuntos tratados deverão ser registrados neste formulário."
          ),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  labelCell("NOME", "", 3600),
                  labelCell("EMPRESA/ÁREA", "", 3000),
                  labelCell("DATA", "", 1400),
                  labelCell("ASSINATURA", "", 1800),
                ],
              }),
              ...Array.from(
                { length: 3 },
                () =>
                  new TableRow({
                    children: [
                      labelCell("", " ", 3600),
                      labelCell("", " ", 3000),
                      labelCell("", " ", 1400),
                      labelCell("", " ", 1800),
                    ],
                  })
              ),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function generateMinutesPdf(
  context: MeetingMinutesDocumentContext,
  data: MeetingMinutesData
) {
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 55, right: 42, bottom: 55, left: 42 },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  pdf.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  const width = pdf.page.width - 84;
  const band = (title: string) => {
    pdf.moveDown(0.5).rect(42, pdf.y, width, 22).fill(`#${BLUE}`);
    pdf
      .fillColor("white")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(title, 48, pdf.y + 6, { width: width - 12, align: "center" });
    pdf.fillColor("black").moveDown(1.8);
  };
  const field = (label: string, value: string) => {
    pdf.font("Helvetica-Bold").fontSize(8).text(label);
    pdf
      .font("Helvetica")
      .fontSize(9)
      .text(value || " ", { paragraphGap: 3 });
  };
  pdf
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#1267A5")
    .text("SEIDOR", 42, 38);
  pdf
    .fillColor("black")
    .fontSize(13)
    .text("ATA DE REUNIÃO", 190, 41, { width: 210, align: "center" });
  pdf
    .fontSize(11)
    .text(context.client || "CLIENTE", 430, 41, {
      width: 120,
      align: "center",
    });
  pdf.moveTo(42, 72).lineTo(553, 72).strokeColor("#999999").stroke();
  pdf.y = 90;
  band("IDENTIFICAÇÃO DO PROJETO");
  field("Nome do Projeto", context.projectName);
  field(
    "Código Controle Custo do Projeto (OI)",
    [context.costCode, context.costCodeDescription].filter(Boolean).join(" — ")
  );
  field(
    "Nome do Cliente / Código do Projeto",
    `${context.client}${context.projectCode ? ` / ${context.projectCode}` : ""}`
  );
  field(
    "Gerência",
    `SEIDOR: ${context.seidorManager || " "}   CLIENTE: ${context.clientManager || " "}`
  );
  field(
    "Responsáveis",
    `Executivo SEIDOR: ${context.seidorExecutive || " "}   Patrocinador: ${context.sponsor || " "}`
  );
  band("IDENTIFICAÇÃO DO DOCUMENTO");
  field("Documento", `${context.projectName}_ATA - ${context.workshopTitle}`);
  field(
    "Autor / Versão / Data",
    `${context.author} / ${context.version} / ${context.generatedAt.toLocaleDateString("pt-BR")}`
  );
  band("DADOS DA ATA DE REUNIÃO");
  field(
    "Data e hora",
    `${context.meetingDate || "Não informada"} ${context.meetingTime || ""}`
  );
  field("Objetivo da Reunião", data.summary || context.workshopTitle);
  field(
    "Participantes",
    data.participants
      .map(item => `${item.name}${item.company ? ` (${item.company})` : ""}`)
      .join(", ") || "Não informado"
  );
  band("ASSUNTOS DISCUTIDOS E/OU DEFINIÇÕES");
  for (const topic of data.topics) {
    pdf
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`• ${topic.title}`, { paragraphGap: 3 });
    for (const item of topic.items)
      pdf
        .font("Helvetica")
        .fontSize(9)
        .text(`  ○ ${item}`, { indent: 12, paragraphGap: 2 });
  }
  if (data.decisions.length) {
    pdf
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Decisões tomadas", { paragraphGap: 3 });
    data.decisions.forEach(item =>
      pdf
        .font("Helvetica")
        .fontSize(9)
        .text(`• ${item}`, { indent: 8, paragraphGap: 2 })
    );
  }
  band("PRÓXIMOS PASSOS");
  (data.nextSteps.length
    ? data.nextSteps
    : ["Não foram identificados próximos passos."]
  ).forEach(item =>
    pdf
      .font("Helvetica")
      .fontSize(9)
      .text(`• ${item}`, { indent: 8, paragraphGap: 3 })
  );
  band("VALIDAÇÃO E APROVAÇÃO");
  pdf
    .font("Helvetica")
    .fontSize(8)
    .text(
      "A revisão, validação e aprovação poderão ser feitas por E-Mail; todos os assuntos tratados deverão ser registrados neste formulário."
    );
  pdf
    .moveDown()
    .font("Helvetica-Bold")
    .text(
      "NOME                         EMPRESA/ÁREA                       DATA             ASSINATURA"
    );
  for (let index = 0; index < 3; index++)
    pdf
      .moveDown(1.2)
      .moveTo(42, pdf.y)
      .lineTo(553, pdf.y)
      .strokeColor("#AAAAAA")
      .stroke();
  const pages = pdf.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    pdf.switchToPage(index);
    pdf
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#808080")
      .text(
        `Documento de propriedade da SEIDOR e de seu PARCEIRO. Não pode ser reproduzido ou compartilhado sem autorização     ${index + 1}`,
        42,
        pdf.page.height - 32,
        { width, align: "center" }
      );
  }
  pdf.end();
  return done;
}
