import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Bitacora from "../models/Bitacora.js";
import ChecklistInicial from "../models/ChecklistInicial.js";
import RegistroOperacion from "../models/RegistroOperacion.js";
import CierreTurno from "../models/CierreTurno.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/* =====================================================
   ORDENAR HORAS SEGÚN TURNO
===================================================== */

function ordenarPorTurno(registros, turno) {

  const ordenDia = [
    "07:00","08:00","09:00","10:00","11:00","12:00",
    "13:00","14:00","15:00","16:00","17:00","18:00"
  ];

  const ordenNoche = [
    "19:00","20:00","21:00","22:00","23:00",
    "00:00","01:00","02:00","03:00","04:00","05:00","06:00"
  ];

  const orden = turno === "DIA" ? ordenDia : ordenNoche;

  return registros.sort((a, b) =>
    orden.indexOf(a.hora) - orden.indexOf(b.hora)
  );
}

/* =====================================================
   HELPERS FECHA
===================================================== */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function obtenerYYMMDD(fecha) {

  const f = new Date(fecha);

  const dia = pad2(f.getDate());
  const mes = pad2(f.getMonth() + 1);
  const anioCompleto = String(f.getFullYear());
  const anioCorto = anioCompleto.slice(-2);

  return { dia, mes, anioCompleto, anioCorto };
}

function obtenerHHMM(fecha) {

  if (!fecha) return "0000";

  const f = new Date(fecha);

  return `${pad2(f.getHours())}${pad2(f.getMinutes())}`;
}

/* =====================================================
   GENERAR NOMBRE Y RUTA
===================================================== */

function generarInfoArchivo(bitacora, extension) {

  const { dia, mes, anioCompleto, anioCorto } =
  obtenerYYMMDD(bitacora.fechaInicio);

  const turno = (bitacora.turno || "").toLowerCase();
  const hhmm = obtenerHHMM(bitacora.fechaCierre);

  const idCorto = String(bitacora._id).slice(-6);

  const nombre =
  `bitacora-${dia}-${mes}-${anioCorto}-${turno}-${hhmm}-${idCorto}.${extension}`;

  const baseUploads = path.join(__dirname, "..", "uploads");
  const carpetaAnio = path.join(baseUploads, anioCompleto);
  const carpetaMes = path.join(carpetaAnio, mes);

  if (!fs.existsSync(baseUploads)) fs.mkdirSync(baseUploads);
  if (!fs.existsSync(carpetaAnio)) fs.mkdirSync(carpetaAnio);
  if (!fs.existsSync(carpetaMes)) fs.mkdirSync(carpetaMes);

  const filePath = path.join(carpetaMes, nombre);

  return { nombre, filePath };
}

/* =====================================================
   GENERAR PDF VERTICAL PROFESIONAL
===================================================== */

export const generarReportePdfInterno = async (bitacoraId) => {

  const bitacora =
  await Bitacora.findById(bitacoraId);

  if (
    !bitacora ||
    bitacora.estado !== "CERRADA"
  ) return null;

  const { dia, mes, anioCompleto } =
  obtenerYYMMDD(bitacora.fechaInicio);

  let [
    checklist,
    registros,
    cierre
  ] = await Promise.all([

    ChecklistInicial.findOne({ bitacoraId }),

    RegistroOperacion.find({ bitacoraId }),

    CierreTurno.findOne({ bitacoraId })

  ]);

  registros =
  ordenarPorTurno(
    registros,
    bitacora.turno
  );

  const { filePath } =
  generarInfoArchivo(
    bitacora,
    "pdf"
  );

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }

  const doc = new PDFDocument({

    size: "A4",
    layout: "portrait",
    margin: 0,
    bufferPages: true

  });

  const stream =
  fs.createWriteStream(filePath);

  doc.pipe(stream);

  /* =====================================================
     COLORS
  ===================================================== */

  const COLORS = {

    violet: "#461D77",
    blue: "#7177EC",

    dark: "#111827",
    gray: "#64748b",

    border: "#dbe4ee",

    green: "#16a34a",
    red: "#dc2626",

    row1: "#f8fafc",
    row2: "#eef2ff"
  };

  /* =====================================================
     NORMALIZAR
  ===================================================== */

  const normalizar = (txt) =>
    txt
      ?.toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");

  /* =====================================================
     HELPERS
  ===================================================== */

  const drawHeader = () => {

    doc.rect(0, 0, 595, 95)
    .fill("#ffffff");

    doc.rect(0, 91, 595, 4)
    .fill(COLORS.violet);

    try {

      const logoPath =
      path.join(
        process.cwd(),
        "src",
        "assets",
        "logo-final.png"
      );

      if (fs.existsSync(logoPath)) {

        doc.image(
          logoPath,
          20,
          18,
          {
            width: 120
          }
        );
      }

    } catch (err) {

      console.log(
        "Error logo:",
        err
      );
    }

    doc.fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(24)
    .text(
      "BITÁCORA DIGITAL DE OPERACIÓN",
      160,
      28
    );

    doc.fillColor(COLORS.gray)
    .font("Helvetica")
    .fontSize(10)
    .text(
      "Sistema digital de control y monitoreo de caldera",
      162,
      65
    );
  };

  const drawFooter = () => {

    doc.rect(0, 812, 595, 30)
    .fill(COLORS.violet);

    doc.fillColor("#ffffff")
    .font("Helvetica")
    .fontSize(8)
    .text(
      "Novandino Litio • Bitácora Digital",
      0,
      823,
      {
        width: 595,
        align: "center"
      }
    );
  };

  const sectionTitle = (
    title,
    y,
    color = COLORS.violet
  ) => {

    doc.roundedRect(
      18,
      y,
      560,
      28,
      8
    )
    .fill(color);

    doc.fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(
      title,
      35,
      y + 9
    );
  };

  const card = (
    x,
    y,
    w,
    h,
    fill = "#ffffff"
  ) => {

    doc.roundedRect(
      x,
      y,
      w,
      h,
      10
    )
    .fillAndStroke(
      fill,
      COLORS.border
    );
  };

  /* =====================================================
     PAGE 1
  ===================================================== */

  drawHeader();

  /* =====================================================
     INFO
  ===================================================== */

  card(18, 115, 560, 65);

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text("OPERADOR", 35, 130);

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(11)
  .text(
    bitacora.operador,
    35,
    148
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text("TURNO", 245, 130);

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(11)
  .text(
    `${bitacora.turno} - ${bitacora.turnoNumero}`,
    245,
    148
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text("FECHA", 430, 130);

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(11)
  .text(
    `${dia}/${mes}/${anioCompleto}`,
    430,
    148
  );

  /* =====================================================
     CHECKLIST
  ===================================================== */

  sectionTitle(
    "I. CHECKLIST INICIAL",
    205
  );

  let checkY = 250;

  const labelsChecklist = {

    calderaHurst:
    "Caldera Hurst",

    bombaAlimentacionAgua:
    "Bomba Alimentación",

    bombaPetroleo:
    "Bomba Petróleo",

    nivelAguaTuboNivel:
    "Nivel Agua",

    purgaSuperficie:
    "Purga",

    bombaDosificadoraQuimicos:
    "Dosificadora",

    trenGas:
    "Tren Gas",

    ablandadores:
    "Ablandadores"
  };

  Object.entries(labelsChecklist)
  .forEach(([key, label], index) => {

    const value =
    checklist?.[key] || "-";

    const x =
    index % 2 === 0
      ? 18
      : 300;

    if (
      index % 2 === 0 &&
      index !== 0
    ) {
      checkY += 34;
    }

    card(
      x,
      checkY,
      260,
      28,
      "#ffffff"
    );

    doc.fillColor(COLORS.dark)
    .font("Helvetica")
    .fontSize(8)
    .text(
      label,
      x + 10,
      checkY + 10
    );

    doc.fillColor(COLORS.green)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(
      String(value)
      .replace(/_/g, " "),
      x + 145,
      checkY + 10
    );

  });

  checkY += 45;

  /* =====================================================
     OBSERVACIONES
  ===================================================== */

  const obsInicial =
  checklist?.observacionesIniciales || "-";

  const obsInicialHeight =
  Math.max(
    50,
    doc.heightOfString(
      obsInicial,
      {
        width: 520
      }
    ) + 35
  );

  card(
    18,
    checkY,
    560,
    obsInicialHeight,
    "#f8f7ff"
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text(
    "OBSERVACIONES",
    35,
    checkY + 10
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(8)
  .text(
    obsInicial,
    35,
    checkY + 25,
    {
      width: 520
    }
  );

  /* =====================================================
     REGISTRO OPERACION
  ===================================================== */

  sectionTitle(
    "II. REGISTRO DE OPERACIÓN",
    checkY + obsInicialHeight + 20
  );

  let tableY =
  checkY +
  obsInicialHeight +
  60;

  /* =====================================================
     COLUMNAS DINÁMICAS
  ===================================================== */

  const columnasSet = new Set();

  registros.forEach(r =>
    r.parametros?.forEach(p =>
      columnasSet.add(p.label)
    )
  );

  const columnasDB =
  Array.from(columnasSet);

  const ordenPreferido = [

    "presioncaldera",
    "vapor",
    "flujoalimentacioncaldera",
    "totalizadoralimentacion",
    "temperaturagaseschimenea",
    "consumodiesel",
    "diesel",
    "flujoaguablanda",
    "totalizadoraguablanda",
    "flujobba41",
    "totalizadorbba41",
    "temperaturasalidaitc"

  ];

  columnasDB.sort((a, b) => {

    const na = normalizar(a);
    const nb = normalizar(b);

    return (
      (
        ordenPreferido.indexOf(na) === -1
          ? 999
          : ordenPreferido.indexOf(na)
      ) -
      (
        ordenPreferido.indexOf(nb) === -1
          ? 999
          : ordenPreferido.indexOf(nb)
      )
    );
  });

  const columnas = [

    {
      key: "hora",
      label: "Hora",
      width: 34
    },

    ...columnasDB.map(c => {

      const label = c
        .replace("Presión caldera", "P.cal")
        .replace("Vapor", "Vapor")
        .replace("Flujo alimentación caldera", "F.al")
        .replace("Totalizador alimentación", "T.al")
        .replace("Temperatura gases chimenea", "T.g")
        .replace("Consumo diesel", "C.d")
        .replace("% Diesel", "%D")
        .replace("Flujo agua blanda", "F.a")
        .replace("Totalizador agua blanda", "T.a")
        .replace("Flujo BBA41", "FI41")
        .replace("Totalizador BBA41", "TB41")
        .replace("Temperatura salida ITC", "ITC");

      let width = 42;

      if (
        label === "P.cal" ||
        label === "%D" ||
        label === "P"
      ) {
        width = 34;
      }

      if (
        label === "T.g" ||
        label === "ITC"
      ) {
        width = 38;
      }

      if (
        label === "FI41" ||
        label === "TB41"
      ) {
        width = 40;
      }

      return {

        key: c,
        label,
        width

      };

    }),

    {
      key: "purga",
      label: "P",
      width: 24
    }

  ];

  const rowHeight = 20;

  const tableX = 8;

  const drawTableHeader = () => {

    let hx = tableX;

    columnas.forEach(col => {

      doc.rect(
        hx,
        tableY,
        col.width,
        rowHeight
      )
      .fill(COLORS.violet);

      doc.fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(5)
      .text(
        col.label,
        hx,
        tableY + 6,
        {
          width: col.width,
          align: "center"
        }
      );

      hx += col.width;
    });

    tableY += rowHeight;
  };

  drawTableHeader();

  registros.forEach((reg, index) => {

    if (tableY > 760) {

      drawFooter();

      doc.addPage();

      drawHeader();

      tableY = 120;

      drawTableHeader();
    }

    let x = tableX;

    columnas.forEach(col => {

      let value = "-";

      if (col.key === "hora") {

        value = reg.hora;

      } else if (col.key === "purga") {

        value = reg.purgaDeFondo;

      } else {

        const param =
        reg.parametros?.find(p => {

          return (
            normalizar(p.label) ===
            normalizar(col.key)
          );
        });

        if (param) {

          value =
          `${param.value || "-"}${
            param.unidad
              ? ` ${param.unidad}`
              : ""
          }`;
        }
      }

      doc.rect(
        x,
        tableY,
        col.width,
        rowHeight
      )
      .fillAndStroke(
        index % 2 === 0
          ? COLORS.row1
          : COLORS.row2,
        COLORS.border
      );

      doc.fillColor(
        col.key === "purga"
          ? (
              value === "SI"
                ? COLORS.green
                : COLORS.red
            )
          : COLORS.dark
      );

      doc.fontSize(5)
      .font("Helvetica")
      .text(
        String(value),
        x,
        tableY + 6,
        {
          width: col.width,
          align: "center"
        }
      );

      x += col.width;
    });

    tableY += rowHeight;
  });

  drawFooter();

  /* =====================================================
   LEYENDA TABLA
===================================================== */

tableY += 18;

if (tableY > 650) {

  drawFooter();

  doc.addPage();

  drawHeader();

  tableY = 130;
}

sectionTitle(
  "REFERENCIA DE PARÁMETROS",
  tableY,
  COLORS.blue
);

tableY += 42;

const referencias = [

  ["Vapor", "Toneladas de vapor"],
  ["%D", "Porcentaje de TK combustible"],
  ["FI41", "Flujo bomba BBA-41"],
  ["P.cal", "Presión de caldera"],
  ["F.al", "Flujo alimentación agua caldera"],
  ["T.al", "Totalizador alimentación agua"],
  ["T.g", "Temperatura gases chimenea"],
  ["C.d", "Consumo de combustible diesel"],
  ["F.a", "Flujo llegada TK agua blanda"],
  ["T.a", "Totalizador agua blanda"],
  ["TB41", "Totalizador bomba BBA-41"],
  ["ITC", "Temperatura salida ITC a TK-23"],
  ["P", "Purga de fondo"]

];

let refY = tableY;

referencias.forEach((r, index) => {

  const x =
    index % 2 === 0
      ? 20
      : 300;

  if (
    index % 2 === 0 &&
    index !== 0
  ) {
    refY += 26;
  }

  doc.roundedRect(
    x,
    refY,
    260,
    20,
    5
  )
  .fillAndStroke(
    index % 2 === 0
      ? "#f8fafc"
      : "#eef2ff",
    COLORS.border
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(7)
  .text(
    r[0],
    x + 8,
    refY + 7
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(7)
  .text(
    r[1],
    x + 48,
    refY + 7,
    {
      width: 200
    }
  );

});

tableY = refY + 40;

  /* =====================================================
     PAGE CIERRE
  ===================================================== */

  doc.addPage();

  drawHeader();

  sectionTitle(
    "III. CIERRE Y FIRMA",
    130,
    COLORS.blue
  );

  card(18, 185, 260, 90);

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text(
    "RECEPCIÓN COMBUSTIBLE",
    35,
    205
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(9)
  .text(
    `Recepción: ${
      cierre?.recepcionCombustible || "-"
    }`,
    35,
    230
  );

  doc.text(
    `Litros: ${
      cierre?.litrosCombustible || "-"
    }`,
    35,
    250
  );

  card(315, 185, 260, 90);

  doc.fillColor(COLORS.blue)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text(
    "TK AGUA BLANDA",
    332,
    205
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(9)
  .text(
    `TK28: ${
      cierre?.tk28EnServicio || "-"
    }`,
    332,
    230
  );

  doc.text(
    `% TK: ${
      cierre?.tk28Porcentaje || "-"
    }`,
    332,
    250
  );

  const obsFinal =
  cierre?.comentariosFinales || "-";

  const obsFinalHeight =
  Math.max(
    110,
    doc.heightOfString(
      obsFinal,
      {
        width: 510
      }
    ) + 40
  );

  card(
    18,
    305,
    557,
    obsFinalHeight,
    "#fafaff"
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text(
    "OBSERVACIONES FINALES",
    35,
    323
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(8)
  .text(
    obsFinal,
    35,
    345,
    {
      width: 510
    }
  );

  /* =====================================================
     FIRMA
  ===================================================== */

  card(
    165,
    335 + obsFinalHeight,
    260,
    120,
    "#ffffff"
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(10)
  .text(
    "FIRMA OPERADOR",
    230,
    355 + obsFinalHeight
  );

  if (cierre?.firmaBase64) {

    try {

      const firma =
      cierre.firmaBase64.replace(
        /^data:image\/png;base64,/,
        ""
      );

      const buffer =
      Buffer.from(
        firma,
        "base64"
      );

      doc.image(
        buffer,
        200,
        385 + obsFinalHeight,
        {
          fit: [180, 45]
        }
      );

    } catch {}
  }

  doc.moveTo(
    210,
    430 + obsFinalHeight
  )
  .lineTo(
    380,
    430 + obsFinalHeight
  )
  .strokeColor("#9ca3af")
  .stroke();

  doc.fillColor(COLORS.dark)
  .font("Helvetica-Bold")
  .fontSize(9)
  .text(
    bitacora.operador,
    165,
    440 + obsFinalHeight,
    {
      width: 260,
      align: "center"
    }
  );

  drawFooter();

  doc.end();

  await new Promise(resolve =>
    stream.on("finish", resolve)
  );

  return filePath;
};


/* =====================================================
   DESCARGAR PDF
===================================================== */

export const descargarReportePdf = async (req, res) => {

  try {

    const { bitacoraId } = req.params;

    const bitacora =
    await Bitacora.findById(bitacoraId);

    if (!bitacora)
      return res.status(404).json({ error: "No encontrada" });

    if (bitacora.estado !== "CERRADA")
      return res.status(400).json({ error: "Bitácora no cerrada" });

    const { nombre, filePath } =
    generarInfoArchivo(bitacora, "pdf");

    const generado =
    await generarReportePdfInterno(bitacoraId);

    if (!generado)
      return res.status(500).json({ error: "No se generó PDF" });

    return res.download(filePath, nombre);

  } catch (error) {

    console.error("ERROR PDF:", error);

    return res.status(500).json({
      error: "Error interno generando PDF"
    });

  }

};

/* =====================================================
   DESCARGAR EXCEL
===================================================== */

const normalizar = (txt) =>
  txt?.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

export const descargarReporteExcel = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findById(bitacoraId);
    if (!bitacora)
      return res.status(404).json({ error: "No encontrada" });

    let [checklist, registros, cierre] = await Promise.all([
      ChecklistInicial.findOne({ bitacoraId }),
      RegistroOperacion.find({ bitacoraId }),
      CierreTurno.findOne({ bitacoraId })
    ]);

    registros = ordenarPorTurno(registros, bitacora.turno);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Bitacora");

    const azul = "FF1F4E78";
    const azulClaro = "FFD9E1F2";
    const verde = "FFC6EFCE";
    const rojo = "FFFFC7CE";

    const borde = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    };

    const center = { horizontal: "center", vertical: "middle", wrapText: true };
    const left = { horizontal: "left", vertical: "middle", wrapText: true };

    let rowIndex = 1;

    /* ================= HEADER ================= */

    sheet.mergeCells("A1:O2");
    const header = sheet.getCell("A1");
    header.value = "REPORTE OPERACIONAL - CALDERA HURST";
    header.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = center;
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };

    rowIndex = 4;

    const { dia, mes, anioCompleto } = obtenerYYMMDD(bitacora.fechaInicio);

    [
      ["Operador", bitacora.operador],
      ["Turno", bitacora.turno],
      ["N° Turno", bitacora.turnoNumero],
      ["Fecha", `${dia}-${mes}-${anioCompleto}`]
    ].forEach(d => {
      const row = sheet.getRow(rowIndex++);
      row.getCell(1).value = d[0];
      row.getCell(2).value = d[1];

      row.eachCell(c => {
        c.border = borde;
        c.alignment = left;
      });
    });

    rowIndex += 2;

    /* ================= CHECKLIST ================= */

rowIndex += 1;

sheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
let cell = sheet.getCell(`A${rowIndex}`);
cell.value = "I. CHECKLIST INICIAL";
cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };
cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
cell.alignment = center;

rowIndex++;

/* 🔥 ENCABEZADO */
const headerChecklist = sheet.getRow(rowIndex++);

["Equipo", "Estado"].forEach((t, i) => {
  const c = headerChecklist.getCell(i + 1);
  c.value = t;
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azulClaro } };
  c.font = { bold: true };
  c.border = borde;
  c.alignment = center;
});

/* 🔥 DATOS */
const filasChecklist = [
  ["Caldera Hurst", checklist?.calderaHurst],
  ["Bomba Alimentación Agua", checklist?.bombaAlimentacionAgua],
  ["Bomba Petróleo", checklist?.bombaPetroleo],
  ["Nivel Agua Tubo Nivel", checklist?.nivelAguaTuboNivel],
  ["Purga Superficie", checklist?.purgaSuperficie],
  ["Bomba Dosificadora Químicos", checklist?.bombaDosificadoraQuimicos],
  ["Tren Gas", checklist?.trenGas],
  ["Ablandadores", checklist?.ablandadores]
];

filasChecklist.forEach(f => {
  const row = sheet.getRow(rowIndex++);
  const estadoRaw = f[1] || "-";
  const estado = estadoRaw.replace(/_/g, " ");

  row.getCell(1).value = f[0];
  row.getCell(2).value = estado;

  row.eachCell(c => {
    c.border = borde;
    c.alignment = left;
  });

  /* 🔥 COLORES */
  if (["FUERA_DE_SERVICIO", "BAJO"].includes(estadoRaw)) {
    row.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: rojo }
    };
  }

  if (["EN_SERVICIO", "NORMAL", "LLENO"].includes(estadoRaw)) {
    row.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: verde }
    };
  }
});

rowIndex += 2;

/* ================= 🔥 TITULO REGISTRO ================= */

    sheet.mergeCells(`A${rowIndex}:O${rowIndex}`);
    cell = sheet.getCell(`A${rowIndex}`);
    cell.value = "II. REGISTRO DE OPERACIÓN";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = center;

    rowIndex++;

    /* ================= 🔥 COLUMNAS DINÁMICAS ================= */

    const columnasSet = new Set();

    registros.forEach(r =>
      r.parametros?.forEach(p => columnasSet.add(p.label))
    );

    const columnasDB = Array.from(columnasSet);

    /* ORDEN DESEADO */
    const ordenPreferido = [
      "presioncaldera",
      "vapor",
      "flujoalimentacioncaldera",
      "totalizadoralimentacion",
      "temperaturagaseschimenea",
      "consumodiesel",
      "diesel",
      "flujoaguablanda",
      "totalizadoraguablanda",
      "flujobba41",
      "totalizadorbba41",
      "temperaturasalidaitc"
    ];

    columnasDB.sort((a, b) => {
      const na = normalizar(a);
      const nb = normalizar(b);

      return (
        (ordenPreferido.indexOf(na) === -1 ? 999 : ordenPreferido.indexOf(na)) -
        (ordenPreferido.indexOf(nb) === -1 ? 999 : ordenPreferido.indexOf(nb))
      );
    });

    const columnas = ["Hora", ...columnasDB];

    /* ================= HEADER TABLA ================= */

    const headerRow = sheet.getRow(rowIndex++);

    columnas.forEach((c, i) => {
      const celda = headerRow.getCell(i + 1);

      /* 🔥 nombres cortos */
      celda.value = c
        .replace("Presión caldera", "Presion")
        .replace("Vapor", "Vapor")
        .replace("Flujo alimentación caldera", "F.Alm")
        .replace("Totalizador alimentación", "Tot.Alm")
        .replace("Temperatura gases chimenea", "T°Gas")
        .replace("Consumo diesel", "Cons")
        .replace("% Diesel", "%D")
        .replace("Flujo agua blanda", "F.Bland")
        .replace("Totalizador agua blanda", "Tot.Bland")
        .replace("Flujo BBA41", "BBA41")
        .replace("Totalizador BBA41", "Tot.BBA41")
        .replace("Temperatura salida ITC", "T°ITC");

      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azulClaro } };
      celda.font = { bold: true };
      celda.border = borde;
      celda.alignment = center;
    });

    /* ancho automático */
    sheet.columns = columnas.map((_, i) => ({
      width: i === 0 ? 10 : 12
    }));

    /* ================= FILAS ================= */

    registros.forEach(r => {
      const row = sheet.getRow(rowIndex++);

      const fila = [r.hora || "-"];

      columnasDB.forEach(col => {
        const p = r.parametros?.find(
          x => normalizar(x.label) === normalizar(col)
        );

        fila.push(
          p
            ? `${p.value}${p.unidad ? " " + p.unidad : ""}`
            : "-"
        );
      });

      row.values = fila;

      row.eachCell(c => {
        c.border = borde;
        c.alignment = center;
      });
    });

    /* ================= CIERRE ================= */

    rowIndex += 2;

    const cierreDatos = [
      ["Recepción combustible", cierre?.recepcionCombustible],
      ["Litros combustible", cierre?.litrosCombustible],
      ["TK en servicio", cierre?.tk28EnServicio],
      ["% Agua blanda", cierre?.tk28Porcentaje]
    ];

    cierreDatos.forEach(d => {
      const row = sheet.getRow(rowIndex++);
      row.getCell(1).value = d[0];
      row.getCell(2).value = d[1] ?? "-";

      row.eachCell(c => {
        c.border = borde;
        c.alignment = left;
      });

      if (d[1] === "SI") {
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: verde } };
      }

      if (d[1] === "NO") {
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rojo } };
      }
    });

    /* ================= EXPORT ================= */

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=bitacora_${bitacora.turnoNumero}.xlsx`
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando Excel" });
  }
};

async function obtenerRegistrosPorRango(desde, hasta) {

  const inicio = new Date(desde);
  const fin = new Date(hasta);
  fin.setHours(23, 59, 59, 999);

  const bitacoras = await Bitacora.find({
    estado: "CERRADA",
    fechaInicio: { $gte: inicio, $lte: fin }
  });

  let todosRegistros = [];

  for (const b of bitacoras) {

    let registros = await RegistroOperacion.find({
      bitacoraId: b._id
    });

    registros = ordenarPorTurno(registros, b.turno);

    const fecha = obtenerYYMMDD(b.fechaInicio);

    registros.forEach(r => {

      const parametrosLimpios = (r.parametros || []).map(p => ({
        label: p.label?.trim(),
        value: p.value ?? "",
        unidad: p.unidad ?? ""
      }));

      todosRegistros.push({
        fecha: `${fecha.dia}-${fecha.mes}-${fecha.anioCompleto}`,
        hora: r.hora || "-",
        parametros: parametrosLimpios,
        purgaDeFondo: r.purgaDeFondo || "NO"
      });

    });

  }

  return todosRegistros;
}

export const descargarExcelRango = async (req, res) => {
  try {

    const { desde, hasta } = req.query;
    const registros = await obtenerRegistrosPorRango(desde, hasta);

    if (!registros.length) {
      return res.status(404).json({ error: "Sin datos en ese rango" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Reporte");

    /* ===== ESTILOS ===== */
    const azul = "FF1F4E78";
    const azulClaro = "FFD9E1F2";

    const borde = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    };

    const center = { horizontal: "center", vertical: "middle", wrapText: true };

    /* ===== COLUMNAS DINÁMICAS ===== */
    const columnasSet = new Set();

    registros.forEach(r =>
      r.parametros.forEach(p => columnasSet.add(p.label))
    );

    const columnas = [
      "Fecha",
      "Hora",
      ...Array.from(columnasSet),
      "Purga"
    ];

    /* ===== HEADER ===== */
    const header = sheet.addRow(columnas);

    header.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.alignment = center;
      cell.border = borde;
    });

    /* ===== FILAS ===== */
    registros.forEach(r => {

      const fila = [];

      fila.push(r.fecha);
      fila.push(r.hora);

      columnas.slice(2, -1).forEach(col => {
        const p = r.parametros.find(x => x.label === col);
        fila.push(p ? `${p.value} ${p.unidad}` : "-");
      });

      fila.push(r.purgaDeFondo);

      const row = sheet.addRow(fila);

      row.eachCell(cell => {
        cell.border = borde;
        cell.alignment = center;
      });

    });

    /* ===== AUTO AJUSTE ===== */
    sheet.columns.forEach(col => {
      col.width = 18;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Disposition", `attachment; filename=reporte_rango.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    res.send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando Excel rango" });
  }
};

export const descargarPdfRango = async (req, res) => {
  try {

    const { desde, hasta } = req.query;
    const registros = await obtenerRegistrosPorRango(desde, hasta);

    if (!registros.length) {
      return res.status(404).json({ error: "Sin datos en ese rango" });
    }

    const doc = new PDFDocument({ size: "A4", margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=reporte_rango.pdf");

    doc.pipe(res);

    /* ===== TITULO ===== */
    doc.fontSize(16)
      .text("REPORTE DE OPERACIÓN POR RANGO", { align: "center" })
      .moveDown();

    doc.fontSize(10)
      .text(`Desde: ${desde}`)
      .text(`Hasta: ${hasta}`)
      .moveDown();

    /* ===== COLUMNAS ===== */
    const columnasSet = new Set();

    registros.forEach(r =>
      r.parametros.forEach(p => columnasSet.add(p.label))
    );

    const columnas = [
      "Fecha",
      "Hora",
      ...Array.from(columnasSet),
      "Purga"
    ];

    const tableWidth = doc.page.width - 80;
    const colWidth = tableWidth / columnas.length;
    const rowHeight = 18;

    let y = doc.y;

    /* ===== HEADER ===== */
    doc.font("Helvetica-Bold").fontSize(7);

    columnas.forEach((col, i) => {
      doc.rect(40 + i * colWidth, y, colWidth, rowHeight)
        .fillAndStroke("#1F4E78", "#000");

      doc.fillColor("white").text(col, 40 + i * colWidth + 2, y + 5, {
        width: colWidth - 4,
        align: "center"
      });
    });

    y += rowHeight;

    /* ===== FILAS ===== */
    doc.font("Helvetica").fontSize(7);

    registros.forEach(r => {

      columnas.forEach((col, i) => {

        let val = "-";

        if (col === "Fecha") val = r.fecha;
        else if (col === "Hora") val = r.hora;
        else if (col === "Purga") val = r.purgaDeFondo;
        else {
          const p = r.parametros.find(x => x.label === col);
          if (p) val = `${p.value} ${p.unidad}`;
        }

        doc.fillColor("black");

        doc.rect(40 + i * colWidth, y, colWidth, rowHeight).stroke();

        doc.text(val, 40 + i * colWidth + 2, y + 5, {
          width: colWidth - 4,
          align: "center"
        });

      });

      y += rowHeight;

      if (y > 750) {
        doc.addPage();
        y = 50;
      }

    });

    doc.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando PDF rango" });
  }
};