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

    /* =========================================
     ESTADO
  ========================================= */

  const estadoTexto =
    String(value)
      .replace(/_/g, " ");

  const estadoUpper =
    estadoTexto.toUpperCase();

  /* COLOR DINÁMICO */

  if (

    estadoUpper.includes("EN SERVICIO") ||

    estadoUpper.includes("NORMAL") ||

    estadoUpper.includes("LLENO")

  ) {

    doc.fillColor(COLORS.green);

  } else {

    doc.fillColor(COLORS.red);
  }

  doc.font("Helvetica-Bold")
  .fontSize(8)
  .text(
    estadoTexto,
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

const normalizar = (txt) =>
  txt?.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");

/* =====================================================
   DESCARGAR EXCEL
===================================================== */

export const descargarReporteExcel = async (req, res) => {

  try {

    const { bitacoraId } = req.params;

    const bitacora =
      await Bitacora.findById(bitacoraId);

    if (!bitacora) {

      return res.status(404).json({
        error: "Bitácora no encontrada"
      });
    }

    let registros =
      await RegistroOperacion.find({ bitacoraId });

    registros =
      ordenarPorTurno(
        registros,
        bitacora.turno
      );

    /* =====================================================
       WORKBOOK
    ===================================================== */

    const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "Novandino Litio";

    workbook.company =
      "Novandino Litio";

    workbook.subject =
      "Bitácora Digital";

    const sheet =
      workbook.addWorksheet("Bitácora");

    sheet.views = [{
      state: "frozen",
      ySplit: 5
    }];

    /* =====================================================
       COLORES
    ===================================================== */

    const COLORS = {

      primary: "FF461D77",

      secondary: "FF7177EC",

      white: "FFFFFFFF",

      dark: "FF111827",

      gray: "FF6B7280",

      light: "FFF8FAFC",

      row1: "FFFFFFFF",

      row2: "FFF3F4F6",

      border: "FFD1D5DB"
    };

    /* =====================================================
       HELPERS
    ===================================================== */

    const border = {

      top: {
        style: "thin",
        color: { argb: COLORS.border }
      },

      left: {
        style: "thin",
        color: { argb: COLORS.border }
      },

      bottom: {
        style: "thin",
        color: { argb: COLORS.border }
      },

      right: {
        style: "thin",
        color: { argb: COLORS.border }
      }
    };

    const center = {

      horizontal: "center",

      vertical: "middle",

      wrapText: true
    };

    const left = {

      horizontal: "left",

      vertical: "middle",

      wrapText: true
    };

    /* =====================================================
       COLUMNAS BASE
    ===================================================== */

    for (let i = 1; i <= 20; i++) {

      sheet.getColumn(i).width = 14;
    }

    /* =====================================================
       LOGO
    ===================================================== */

    try {

      const logoPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "logo-novandino5.png"
      );

      if (fs.existsSync(logoPath)) {

        const imageId =
          workbook.addImage({

            filename: logoPath,

            extension: "png"
          });

        sheet.addImage(imageId, {

          tl: {
            col: 0.3,
            row: 0.4
          },

          ext: {
            width: 230,
            height: 80
          }
        });
      }

    } catch (err) {

      console.log(
        "ERROR LOGO:",
        err
      );
    }

    /* =====================================================
       TITULO
    ===================================================== */

    sheet.mergeCells("D2:N2");

    const title =
      sheet.getCell("D2");

    title.value =
      "BITÁCORA DIGITAL DE OPERACIÓN";

    title.font = {

      size: 24,

      bold: true,

      color: {
        argb: COLORS.dark
      }
    };

    title.alignment = center;

    sheet.mergeCells("D3:N3");

    const subtitle =
      sheet.getCell("D3");

    subtitle.value =
      "Sistema digital de control y monitoreo de caldera";

    subtitle.font = {

      size: 11,

      color: {
        argb: COLORS.gray
      }
    };

    subtitle.alignment = center;

    for (let i = 1; i <= 14; i++) {

      const cell =
        sheet.getCell(5, i);

      cell.fill = {

        type: "pattern",

        pattern: "solid",

        fgColor: {
          argb: COLORS.primary
        }
      };
    }

    /* =====================================================
       INFO GENERAL
    ===================================================== */

    const { dia, mes, anioCompleto } =
      obtenerYYMMDD(
        bitacora.fechaInicio
      );

    let rowIndex = 7;

    sheet.mergeCells("A7:B7");
    sheet.mergeCells("C7:D7");
    sheet.mergeCells("E7:F7");
    sheet.mergeCells("G7:H7");

    const headersInfo = [

      ["A7", "OPERADOR"],
      ["C7", "TURNO"],
      ["E7", "N° TURNO"],
      ["G7", "FECHA"]

    ];

    headersInfo.forEach(h => {

      const cell =
        sheet.getCell(h[0]);

      cell.value = h[1];

      cell.fill = {

        type: "pattern",

        pattern: "solid",

        fgColor: {
          argb: COLORS.primary
        }
      };

      cell.font = {

        bold: true,

        color: {
          argb: COLORS.white
        }
      };

      cell.alignment = center;

      cell.border = border;
    });

    sheet.mergeCells("A8:B8");
    sheet.mergeCells("C8:D8");
    sheet.mergeCells("E8:F8");
    sheet.mergeCells("G8:H8");

    const valuesInfo = [

      ["A8", bitacora.operador],

      ["C8", bitacora.turno],

      ["E8", bitacora.turnoNumero],

      ["G8", `${dia}-${mes}-${anioCompleto}`]

    ];

    valuesInfo.forEach(v => {

      const cell =
        sheet.getCell(v[0]);

      cell.value = v[1];

      cell.fill = {

        type: "pattern",

        pattern: "solid",

        fgColor: {
          argb: COLORS.light
        }
      };

      cell.font = {

        bold: true,

        color: {
          argb: COLORS.dark
        }
      };

      cell.alignment = center;

      cell.border = border;
    });

    /* =====================================================
       REGISTRO OPERACIÓN
    ===================================================== */

    rowIndex = 12;

    sheet.mergeCells(`A${rowIndex}:N${rowIndex}`);

    let cell =
      sheet.getCell(`A${rowIndex}`);

    cell.value =
      "REGISTRO DE OPERACIÓN";

    cell.fill = {

      type: "pattern",

      pattern: "solid",

      fgColor: {
        argb: COLORS.primary
      }
    };

    cell.font = {

      bold: true,

      size: 12,

      color: {
        argb: COLORS.white
      }
    };

    cell.alignment = center;

    rowIndex++;

    const columnasSet =
      new Set();

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
        )

        -

        (
          ordenPreferido.indexOf(nb) === -1
            ? 999
            : ordenPreferido.indexOf(nb)
        )
      );
    });

    const columnas = [

      "Hora",

      ...columnasDB,

      "P"
    ];

    columnas.forEach((_, i) => {

      const column =
        sheet.getColumn(i + 1);

      column.width =
        i === 0 ? 10 : 14;
    });

    const nombres = {

      "Presión caldera": "P.cal",

      "Vapor": "Vapor",

      "Flujo alimentación caldera": "F.al",

      "Totalizador alimentación": "T.al",

      "Temperatura gases chimenea": "T.g",

      "Consumo diesel": "C.d",

      "% Diesel": "%D",

      "Flujo agua blanda": "F.a",

      "Totalizador agua blanda": "T.a",

      "Flujo BBA41": "Fl41",

      "Totalizador BBA41": "TB41",

      "Temperatura salida ITC": "ITC"
    };

    const headerRow =
      sheet.getRow(rowIndex++);

    headerRow.height = 30;

    columnas.forEach((c, i) => {

      const celda =
        headerRow.getCell(i + 1);

      celda.value =
        nombres[c] || c;

      celda.fill = {

        type: "pattern",

        pattern: "solid",

        fgColor: {
          argb: COLORS.secondary
        }
      };

      celda.font = {

        bold: true,

        size: 9,

        color: {
          argb: COLORS.white
        }
      };

      celda.border = border;

      celda.alignment = center;
    });

    registros.forEach((r, idx) => {

      const row =
        sheet.getRow(rowIndex++);

      row.height = 24;

      const fila = [
        r.hora || "-"
      ];

      columnasDB.forEach(col => {

        const p =
          r.parametros?.find(
            x =>
              normalizar(x.label) ===
              normalizar(col)
          );

        fila.push(

          p
            ? `${p.value}${p.unidad ? " " + p.unidad : ""}`
            : "-"
        );
      });

      fila.push(
        r.purgaDeFondo || "-"
      );

      fila.forEach((v, i) => {

        const cell =
          row.getCell(i + 1);

        cell.value = v;

        cell.border = border;

        cell.alignment = center;

        cell.font = {
          size: 9
        };

        cell.fill = {

          type: "pattern",

          pattern: "solid",

          fgColor: {

            argb:

              idx % 2 === 0

                ? COLORS.row1

                : COLORS.row2
          }
        };
      });
    });

    /* =====================================================
   REFERENCIA PARÁMETROS
===================================================== */

const refStartRow = rowIndex + 3;

sheet.getColumn(17).width = 18;
sheet.getColumn(18).width = 42;

sheet.mergeCells(`Q${refStartRow}:R${refStartRow}`);

const refTitle =
  sheet.getCell(`Q${refStartRow}`);

refTitle.value =
  "REFERENCIA PARÁMETROS";

refTitle.fill = {

  type: "pattern",

  pattern: "solid",

  fgColor: {
    argb: COLORS.primary
  }
};

refTitle.font = {

  bold: true,

  size: 11,

  color: {
    argb: COLORS.white
  }
};

refTitle.alignment = center;

refTitle.border = border;

const refHeader =
  sheet.getRow(refStartRow + 1);

["SIGLA", "DESCRIPCIÓN"]
  .forEach((h, i) => {

    const c =
      refHeader.getCell(i + 17);

    c.value = h;

    c.fill = {

      type: "pattern",

      pattern: "solid",

      fgColor: {
        argb: COLORS.secondary
      }
    };

    c.font = {

      bold: true,

      color: {
        argb: COLORS.white
      }
    };

    c.alignment = center;

    c.border = border;
  });

const referencias = [

  ["P.cal", "Presión de caldera"],

  ["Vapor", "Toneladas de vapor"],

  ["%D", "Porcentaje combustible"],

  ["Fl41", "Flujo bomba 41"],

  ["F.al", "Flujo alimentación agua"],

  ["T.al", "Totalizador alimentación"],

  ["T.g", "Temperatura gases"],

  ["C.d", "Consumo diesel"],

  ["F.a", "Flujo agua blanda"],

  ["T.a", "Totalizador agua blanda"],

  ["TB41", "Totalizador bomba 41"],

  ["ITC", "Temperatura salida ITC"],

  ["P", "Purga fondo"]
];

referencias.forEach((r, idx) => {

  const row =
    sheet.getRow(refStartRow + 2 + idx);

  row.height = 22;

  const siglaCell =
    row.getCell(17);

  siglaCell.value = r[0];

  siglaCell.font = {

    bold: true,

    size: 9
  };

  siglaCell.alignment = center;

  siglaCell.border = border;

  siglaCell.fill = {

    type: "pattern",

    pattern: "solid",

    fgColor: {

      argb:

        idx % 2 === 0

          ? COLORS.row1

          : COLORS.row2
    }
  };

  const descCell =
    row.getCell(18);

  descCell.value = r[1];

  descCell.font = {
    size: 9
  };

  descCell.alignment = left;

  descCell.border = border;

  descCell.fill = {

    type: "pattern",

    pattern: "solid",

    fgColor: {

      argb:

        idx % 2 === 0

          ? COLORS.row1

          : COLORS.row2
    }
  };
});

    /* =====================================================
       EXPORT
    ===================================================== */

    const buffer =
      await workbook.xlsx.writeBuffer();

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

    res.status(500).json({
      error: "Error generando Excel"
    });
  }
};

/* ================= RANGOS ================= */

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

/* ================= EXCEL RANGO ================= */

export const descargarExcelRango = async (req, res) => {

  try {

    const { desde, hasta } = req.query;

    const registros =
      await obtenerRegistrosPorRango(desde, hasta);

    if (!registros.length) {

      return res.status(404).json({
        error: "Sin datos en ese rango"
      });
    }

    const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "Novandino Litio";

    const sheet =
      workbook.addWorksheet("Reporte");

    sheet.views = [{
      state: "frozen",
      ySplit: 6
    }];

    /* =====================================================
       COLORES
    ===================================================== */

    const COLORS = {

      primary: "FF461D77",

      secondary: "FF7177EC",

      white: "FFFFFFFF",

      dark: "FF111827",

      gray: "FF6B7280",

      row1: "FFFFFFFF",

      row2: "FFF3F4F6",

      border: "FFD1D5DB"
    };

    const border = {

      top: {
        style: "thin",
        color: { argb: COLORS.border }
      },

      left: {
        style: "thin",
        color: { argb: COLORS.border }
      },

      bottom: {
        style: "thin",
        color: { argb: COLORS.border }
      },

      right: {
        style: "thin",
        color: { argb: COLORS.border }
      }
    };

    const center = {

      horizontal: "center",

      vertical: "middle",

      wrapText: true
    };

    /* =====================================================
       LOGO
    ===================================================== */

    try {

      const logoPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "logo-novandino5.png"
      );

      if (fs.existsSync(logoPath)) {

        const imageId =
          workbook.addImage({

            filename: logoPath,

            extension: "png"
          });

        sheet.addImage(imageId, {

          tl: {
            col: 0.3,
            row: 0.4
          },

          ext: {
            width: 220,
            height: 75
          }
        });
      }

    } catch (err) {

      console.log(err);
    }

    /* =====================================================
       TITULO
    ===================================================== */

    sheet.mergeCells("D2:N2");

    const title =
      sheet.getCell("D2");

    title.value =
      "REPORTE OPERACIONAL POR RANGO";

    title.font = {

      size: 22,

      bold: true,

      color: {
        argb: COLORS.dark
      }
    };

    title.alignment = center;

    sheet.mergeCells("D3:N3");

    const subtitle =
      sheet.getCell("D3");

    subtitle.value =
      `Desde ${desde} hasta ${hasta}`;

    subtitle.font = {

      size: 11,

      color: {
        argb: COLORS.gray
      }
    };

    subtitle.alignment = center;

    /* =====================================================
   LINEA SUPERIOR VIOLETA
===================================================== */

for (let i = 1; i <= 18; i++) {

  const cell =
    sheet.getCell(5, i);

  cell.fill = {

    type: "pattern",

    pattern: "solid",

    fgColor: {
      argb: COLORS.primary
    }
  };
}

    /* =====================================================
       COLUMNAS
    ===================================================== */

    const columnasSet =
      new Set();

    registros.forEach(r =>
      r.parametros.forEach(p =>
        columnasSet.add(p.label)
      )
    );

    const columnasDB =
      Array.from(columnasSet);

    const columnas = [

      "Fecha",

      "Hora",

      ...columnasDB,

      "Purga"
    ];

    const nombres = {

      "Presión caldera": "P.cal",

      "Vapor": "Vapor",

      "Flujo alimentación caldera": "F.al",

      "Totalizador alimentación": "T.al",

      "Temperatura gases chimenea": "T.g",

      "Consumo diesel": "C.d",

      "% Diesel": "%D",

      "Flujo agua blanda": "F.a",

      "Totalizador agua blanda": "T.a",

      "Flujo BBA41": "Fl41",

      "Totalizador BBA41": "TB41",

      "Temperatura salida ITC": "ITC"
    };

    let rowIndex = 7;

    /* =====================================================
       HEADER TABLA
    ===================================================== */

    const headerRow =
      sheet.getRow(rowIndex++);

    headerRow.height = 28;

    columnas.forEach((c, i) => {

      const cell =
        headerRow.getCell(i + 1);

      cell.value =
        nombres[c] || c;

      cell.fill = {

        type: "pattern",

        pattern: "solid",

        fgColor: {
          argb: COLORS.secondary
        }
      };

      cell.font = {

        bold: true,

        size: 9,

        color: {
          argb: COLORS.white
        }
      };

      cell.alignment = center;

      cell.border = border;

      sheet.getColumn(i + 1).width =
        i <= 1 ? 14 : 15;
    });

    /* =====================================================
       FILAS
    ===================================================== */

    registros.forEach((r, idx) => {

      const row =
        sheet.getRow(rowIndex++);

      row.height = 24;

      const fila = [];

      fila.push(r.fecha);
      fila.push(r.hora);

      columnasDB.forEach(col => {

        const p =
          r.parametros.find(
            x => x.label === col
          );

        fila.push(
          p
            ? `${p.value} ${p.unidad || ""}`
            : "-"
        );
      });

      fila.push(r.purgaDeFondo);

      fila.forEach((v, i) => {

        const cell =
          row.getCell(i + 1);

        cell.value = v;

        cell.font = {
          size: 9
        };

        cell.alignment = center;

        cell.border = border;

        cell.fill = {

          type: "pattern",

          pattern: "solid",

          fgColor: {

            argb:

              idx % 2 === 0

                ? COLORS.row1

                : COLORS.row2
          }
        };
      });
    });

    /* =====================================================
       EXPORT
    ===================================================== */

    const buffer =
      await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=reporte_rango.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Error generando Excel rango"
    });
  }
};

/* =====================================================
       PDF RANGO
    ===================================================== */

export const descargarPdfRango = async (req, res) => {

  try {

    const { desde, hasta } = req.query;

    const registros =
      await obtenerRegistrosPorRango(desde, hasta);

    if (!registros.length) {

      return res.status(404).json({
        error: "Sin datos en ese rango"
      });
    }

    /* =====================================================
       PDF
    ===================================================== */

    const doc =
      new PDFDocument({

        size: "A4",

        layout: "landscape",

        margin: 30
      });

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      "inline; filename=reporte_rango.pdf"
    );

    doc.pipe(res);

    /* =====================================================
       COLORES
    ===================================================== */

    const COLORS = {

      primary: "#461D77",

      secondary: "#7177EC",

      dark: "#111827",

      gray: "#6B7280",

      row1: "#FFFFFF",

      row2: "#F3F4F6",

      border: "#D1D5DB"
    };

    /* =====================================================
       LOGO
    ===================================================== */

    try {

      const logoPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "logo-novandino5.png"
      );

      if (fs.existsSync(logoPath)) {

        doc.image(
          logoPath,
          35,
          22,
          {
            width: 170
          }
        );
      }

    } catch (err) {

      console.log(
        "ERROR LOGO PDF:",
        err
      );
    }

    /* =====================================================
       TITULO
    ===================================================== */

    doc
      .fillColor(COLORS.dark)
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(
        "REPORTE OPERACIONAL POR RANGO",
        0,
        35,
        {
          align: "center"
        }
      );

    doc
      .fillColor(COLORS.gray)
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Desde ${desde} hasta ${hasta}`,
        {
          align: "center"
        }
      );

    /* =====================================================
       BARRA SUPERIOR
    ===================================================== */

    doc
      .rect(
        30,
        92,
        doc.page.width - 60,
        7
      )
      .fill(COLORS.primary);

    /* =====================================================
       NOMBRES COLUMNAS
    ===================================================== */

    const nombres = {

      "Presión caldera": "P.cal",

      "Vapor": "Vapor",

      "Flujo alimentación caldera": "F.al",

      "Totalizador alimentación": "T.al",

      "Temperatura gases chimenea": "T.g",

      "Consumo diesel": "C.d",

      "% Diesel": "%D",

      "Flujo agua blanda": "F.a",

      "Totalizador agua blanda": "T.a",

      "Flujo BBA41": "Fl41",

      "Totalizador BBA41": "TB41",

      "Temperatura salida ITC": "ITC"
    };

    /* =====================================================
       COLUMNAS DINAMICAS
    ===================================================== */

    const columnasSet = new Set();

    registros.forEach(r =>
      r.parametros.forEach(p =>
        columnasSet.add(p.label)
      )
    );

    const columnasDB =
      Array.from(columnasSet);

    /* =====================================================
       ORDEN
    ===================================================== */

    const ordenPreferido = [

      "Presión caldera",

      "Vapor",

      "Flujo alimentación caldera",

      "Totalizador alimentación",

      "Temperatura gases chimenea",

      "Consumo diesel",

      "% Diesel",

      "Flujo agua blanda",

      "Totalizador agua blanda",

      "Flujo BBA41",

      "Totalizador BBA41",

      "Temperatura salida ITC"
    ];

    columnasDB.sort((a, b) => {

      const ia =
        ordenPreferido.indexOf(a);

      const ib =
        ordenPreferido.indexOf(b);

      return (
        (ia === -1 ? 999 : ia)
        -
        (ib === -1 ? 999 : ib)
      );
    });

    /* =====================================================
       COLUMNAS FINALES
    ===================================================== */

    const columnasFinales = [

      "Fecha",

      "Hora",

      ...columnasDB,

      "P"
    ];

    /* =====================================================
       ANCHOS DINAMICOS
    ===================================================== */

    const totalDisponible =
      doc.page.width - 80;

    const columnasFijas = 3;

    const anchoFijo =
      60 + 42 + 32;

    const anchoDinamico =
      Math.max(
        38,
        (totalDisponible - anchoFijo)
        /
        (columnasFinales.length - columnasFijas)
      );

    const columnasConfig =
      columnasFinales.map(col => {

        if (col === "Fecha") {

          return {
            key: col,
            width: 60
          };
        }

        if (col === "Hora") {

          return {
            key: col,
            width: 42
          };
        }

        if (col === "P") {

          return {
            key: col,
            original: "P",
            width: 32
          };
        }

        return {

          key:
            nombres[col] || col,

          original: col,

          width: anchoDinamico
        };
      });

    const rowHeight = 18;

    /* =====================================================
       CALCULAR ANCHO TOTAL
    ===================================================== */

    const totalWidth =
      columnasConfig.reduce(
        (acc, col) => acc + col.width,
        0
      );

    const marginX =
      (doc.page.width - totalWidth) / 2;

    let y = 118;

    /* =====================================================
       HEADER
    ===================================================== */

    const drawHeader = () => {

      let currentX = marginX;

      columnasConfig.forEach(col => {

        doc
          .rect(
            currentX,
            y,
            col.width,
            rowHeight
          )
          .fillAndStroke(
            COLORS.secondary,
            COLORS.border
          );

        doc
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(7)
          .text(

            col.key,

            currentX,

            y + 5,

            {

              width: col.width,

              align: "center"
            }
          );

        currentX += col.width;
      });

      y += rowHeight;
    };

    drawHeader();

    /* =====================================================
       FILAS
    ===================================================== */

    registros.forEach((r, idx) => {

      if (y > 520) {

        doc.addPage({

          size: "A4",

          layout: "landscape",

          margin: 30
        });

        y = 40;

        drawHeader();
      }

      const bgColor =
        idx % 2 === 0
          ? COLORS.row1
          : COLORS.row2;

      let x = marginX;

      columnasConfig.forEach(col => {

        let value = "-";

        if (col.key === "Fecha") {

          value = r.fecha;

        } else if (col.key === "Hora") {

          value = r.hora;

        } else if (
          col.original === "P" ||
          col.key === "P"
        ) {

          value = r.purgaDeFondo;

        } else {

          const p =
            r.parametros.find(
              x => x.label === col.original
            );

          if (p) {

            value =
              `${p.value}${p.unidad ? " " + p.unidad : ""}`;
          }
        }

        doc
          .rect(
            x,
            y,
            col.width,
            rowHeight
          )
          .fillAndStroke(
            bgColor,
            COLORS.border
          );

        doc
          .fillColor(COLORS.dark)
          .font("Helvetica")
          .fontSize(6.5)
          .text(

            value,

            x + 1,

            y + 5,

            {

              width: col.width - 2,

              align: "center"
            }
          );

        x += col.width;
      });

      y += rowHeight;
    });

    /* =====================================================
       REFERENCIAS
    ===================================================== */

    doc.addPage({

      size: "A4",

      layout: "landscape",

      margin: 30
    });

    y = 40;

    /* =====================================================
       TITULO REFERENCIAS
    ===================================================== */

    doc
      .rect(
        60,
        y,
        350,
        22
      )
      .fill(COLORS.primary);

    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        "REFERENCIA PARÁMETROS",
        72,
        y + 7
      );

    y += 22;

    /* =====================================================
       DATOS REFERENCIAS
    ===================================================== */

    const referencias = [

      ["P.cal", "Presión de caldera"],

      ["Vapor", "Toneladas de vapor"],

      ["%D", "Porcentaje combustible"],

      ["Fl41", "Flujo bomba 41"],

      ["F.al", "Flujo alimentación agua"],

      ["T.al", "Totalizador alimentación"],

      ["T.g", "Temperatura gases chimenea"],

      ["C.d", "Consumo diesel"],

      ["F.a", "Flujo agua blanda"],

      ["T.a", "Totalizador agua blanda"],

      ["TB41", "Totalizador bomba 41"],

      ["ITC", "Temperatura salida ITC"],

      ["P", "Purga fondo"]
    ];

    referencias.forEach((r, idx) => {

      const bg =
        idx % 2 === 0
          ? COLORS.row1
          : COLORS.row2;

      /* SIGLA */

      doc
        .rect(
          60,
          y,
          110,
          22
        )
        .fillAndStroke(
          bg,
          COLORS.border
        );

      doc
        .fillColor(COLORS.dark)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(
          r[0],
          60,
          y + 7,
          {
            width: 110,
            align: "center"
          }
        );

      /* DESCRIPCION */

      doc
        .rect(
          170,
          y,
          340,
          22
        )
        .fillAndStroke(
          bg,
          COLORS.border
        );

      doc
        .fillColor(COLORS.dark)
        .font("Helvetica")
        .fontSize(9)
        .text(
          r[1],
          182,
          y + 7
        );

      y += 22;
    });

    /* =====================================================
       FINALIZAR
    ===================================================== */

    doc.end();

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Error generando PDF rango"
    });
  }
};