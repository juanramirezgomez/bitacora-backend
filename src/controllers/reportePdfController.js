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
   PDF PREMIUM NOVANDINO
   DISEÑO CORPORATIVO
===================================================== */

export const generarReportePdfInterno = async (bitacoraId) => {

  const bitacora =
  await Bitacora.findById(bitacoraId);

  if (!bitacora ||
      bitacora.estado !== "CERRADA")
    return null;

  const { dia, mes, anioCompleto } =
  obtenerYYMMDD(bitacora.fechaInicio);

  let [checklist, registros, cierre] =
  await Promise.all([

    ChecklistInicial.findOne({ bitacoraId }),

    RegistroOperacion.find({ bitacoraId }),

    CierreTurno.findOne({ bitacoraId })

  ]);

  registros =
  ordenarPorTurno(registros, bitacora.turno);

  const { filePath } =
  generarInfoArchivo(bitacora, "pdf");

  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }

  /* =====================================================
     PDF
  ===================================================== */

  const doc = new PDFDocument({

    size: "LEGAL",
    layout: "landscape",
    margin: 0

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

    light: "#f8fafc",
    border: "#dbe4ee",

    green: "#16a34a",
    red: "#dc2626"
  };

  /* =====================================================
     HELPERS
  ===================================================== */

  const drawHeader = () => {

    doc.rect(0, 0, 1008, 105)
    .fill("#ffffff");

    doc.rect(0, 101, 1008, 4)
    .fill(COLORS.violet);

    try {

      const logoPath = path.join(
        process.cwd(),
        "src",
        "assets",
        "logo-final.png"
      );

      if (fs.existsSync(logoPath)) {

        doc.image(
          logoPath,
          30,
          20,
          {
            width: 130
          }
        );
      }

    } catch (err) {

      console.log("Error logo:", err);
    }

    doc.fillColor(COLORS.dark)
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(
      "BITÁCORA DIGITAL DE OPERACIÓN",
      210,
      34
    );

    doc.fillColor(COLORS.gray)
    .font("Helvetica")
    .fontSize(11)
    .text(
      "Sistema digital de control y monitoreo de caldera",
      212,
      72
    );
  };

  const drawFooter = () => {

    doc.rect(0, 585, 1008, 28)
    .fill(COLORS.violet);

    doc.fillColor("#ffffff")
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Novandino Litio • Bitácora Digital",
      0,
      595,
      {
        align: "center",
        width: 1008
      }
    );

  };

  const sectionTitle = (
    title,
    y,
    color = COLORS.violet
  ) => {

    doc.roundedRect(
      20,
      y,
      968,
      34,
      8
    )
    .fill(color);

    doc.fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(
      title,
      38,
      y + 10
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

  card(20, 130, 968, 72);

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(10)
  .text("OPERADOR", 50, 148);

  doc.fillColor(COLORS.dark)
  .fontSize(15)
  .text(bitacora.operador, 50, 168);

  doc.fillColor(COLORS.violet)
  .fontSize(10)
  .text("TURNO", 320, 148);

  doc.fillColor(COLORS.dark)
  .fontSize(15)
  .text(
    `${bitacora.turno} - ${bitacora.turnoNumero}`,
    320,
    168
  );

  doc.fillColor(COLORS.violet)
  .fontSize(10)
  .text("FECHA", 600, 148);

  doc.fillColor(COLORS.dark)
  .fontSize(15)
  .text(
    `${dia}/${mes}/${anioCompleto}`,
    600,
    168
  );

  /* =====================================================
     CHECKLIST
  ===================================================== */

  sectionTitle(
    "I. CHECKLIST INICIAL",
    230
  );

  let checkY = 285;

  const labelsChecklist = {

    calderaHurst:
    "Caldera Hurst",

    bombaAlimentacionAgua:
    "Bomba Alimentación Agua",

    bombaPetroleo:
    "Bomba Petróleo",

    nivelAguaTuboNivel:
    "Nivel Agua Tubo Nivel",

    purgaSuperficie:
    "Purga Superficie",

    bombaDosificadoraQuimicos:
    "Bomba Dosificadora",

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
        ? 20
        : 505;

    if (index % 2 === 0 && index !== 0)
      checkY += 42;

    card(
      x,
      checkY,
      465,
      34,
      "#ffffff"
    );

    doc.fillColor(COLORS.dark)
    .font("Helvetica")
    .fontSize(10)
    .text(
      label,
      x + 15,
      checkY + 12
    );

    doc.fillColor(COLORS.green)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(
      String(value).replace(/_/g, " "),
      x + 300,
      checkY + 12
    );

  });

  checkY += 60;

  /* =====================================================
     OBSERVACIONES
  ===================================================== */

  card(
    20,
    checkY,
    968,
    70,
    "#f8f7ff"
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(11)
  .text(
    "OBSERVACIONES INICIALES",
    40,
    checkY + 15
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(10)
  .text(
    checklist?.observacionesIniciales || "-",
    40,
    checkY + 38,
    {
      width: 900
    }
  );

  /* =====================================================
     REGISTROS
  ===================================================== */

  sectionTitle(
    "II. REGISTRO DE OPERACIÓN (LECTURAS)",
    checkY + 100
  );

  let tableY = checkY + 155;

  /* COLUMNAS */

  const columnas = ["Hora"];

  const labelsSet = new Set();

  registros.forEach(reg => {

    reg.parametros?.forEach(p => {

      labelsSet.add(p.label);

    });

  });

  columnas.push(...Array.from(labelsSet));

  columnas.push("Purga");

  const startX = 10;

  const tableWidth = 970;

  const colWidth =
  tableWidth / columnas.length;

  /* =====================================================
     HEADER TABLA FIX
  ===================================================== */

  let x = startX;

  columnas.forEach(col => {

    doc
      .rect(
        x,
        tableY,
        colWidth,
        24
      )
      .fillAndStroke(
        COLORS.violet,
        "#ffffff"
      );

    let titulo = col;

    titulo = titulo
      .replace("Presión", "P.")
      .replace("Temperatura", "T.")
      .replace("alimentación", "Alim.")
      .replace("caldera", "Cald.")
      .replace("agua", "Ag.")
      .replace("diesel", "Dsl.")
      .replace("Flujo", "Fl.")
      .replace("Purga", "Pg.");

    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(5)
      .text(
        titulo,
        x + 1,
        tableY + 8,
        {
          width: colWidth - 2,
          align: "center",
          lineBreak: false
        }
      );

    x += colWidth;
  });

  tableY += 24;

  /* =====================================================
     FILAS
  ===================================================== */

  registros.forEach((reg, rowIndex) => {

    x = startX;

    columnas.forEach(col => {

      let valor = "-";

      if (col === "Hora") {

        valor = reg.hora || "-";

      } else if (col === "Purga") {

        valor = reg.purgaDeFondo || "-";

      } else {

        const found =
        reg.parametros?.find(
          p => p.label === col
        );

        if (found)
          valor = `${found.value}`;
      }

      doc.rect(
        x,
        tableY,
        colWidth,
        22
      )
      .fillAndStroke(
        rowIndex % 2 === 0
          ? "#ffffff"
          : "#f8faff",
        COLORS.border
      );

      let color = COLORS.dark;

      if (valor === "SI")
        color = COLORS.green;

      if (valor === "NO")
        color = COLORS.red;

      doc.fillColor(color)
      .font("Helvetica")
      .fontSize(5.5)
      .text(
        String(valor),
        x + 1,
        tableY + 7,
        {
          width: colWidth - 2,
          align: "center",
          lineBreak: false
        }
      );

      x += colWidth;
    });

    tableY += 22;

    /* NUEVA PAGINA */

    if (tableY > 520) {

      drawFooter();

      doc.addPage();

      drawHeader();

      tableY = 150;

      let rx = startX;

      columnas.forEach(col => {

        doc
          .rect(
            rx,
            tableY,
            colWidth,
            24
          )
          .fillAndStroke(
            COLORS.violet,
            "#ffffff"
          );

        let titulo = col;

        titulo = titulo
          .replace("Presión", "P.")
          .replace("Temperatura", "T.")
          .replace("alimentación", "Alim.")
          .replace("caldera", "Cald.")
          .replace("agua", "Ag.")
          .replace("diesel", "Dsl.")
          .replace("Flujo", "Fl.")
          .replace("Purga", "Pg.");

        doc
          .fillColor("#ffffff")
          .font("Helvetica-Bold")
          .fontSize(5)
          .text(
            titulo,
            rx + 1,
            tableY + 8,
            {
              width: colWidth - 2,
              align: "center",
              lineBreak: false
            }
          );

        rx += colWidth;
      });

      tableY += 24;
    }

  });

  drawFooter();

  /* =====================================================
     PAGE CIERRE
  ===================================================== */

  doc.addPage();

  drawHeader();

  sectionTitle(
    "III. CIERRE Y FIRMA",
    140,
    COLORS.blue
  );

  card(25, 205, 460, 100);

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(11)
  .text(
    "RECEPCIÓN COMBUSTIBLE",
    50,
    225
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(11)
  .text(
    `Recepción combustible: ${cierre?.recepcionCombustible || "-"}`,
    50,
    255
  );

  doc.text(
    `Litros combustible: ${cierre?.litrosCombustible || "-"}`,
    50,
    280
  );

  card(525, 205, 460, 100);

  doc.fillColor(COLORS.blue)
  .font("Helvetica-Bold")
  .fontSize(11)
  .text(
    "TK AGUA BLANDA",
    550,
    225
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(11)
  .text(
    `TK28 en servicio: ${cierre?.tk28EnServicio || "-"}`,
    550,
    255
  );

  doc.text(
    `% TK agua blanda: ${cierre?.tk28Porcentaje || "-"}`,
    550,
    280
  );

  card(
    25,
    340,
    960,
    130,
    "#fafaff"
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(11)
  .text(
    "OBSERVACIONES FINALES",
    50,
    360
  );

  doc.fillColor(COLORS.dark)
  .font("Helvetica")
  .fontSize(10)
  .text(
    cierre?.comentariosFinales || "-",
    50,
    390,
    {
      width: 900
    }
  );

  /* FIRMA */

  card(
    330,
    520,
    340,
    220,
    "#ffffff"
  );

  doc.fillColor(COLORS.violet)
  .font("Helvetica-Bold")
  .fontSize(12)
  .text(
    "FIRMA OPERADOR",
    430,
    545
  );

  if (cierre?.firmaBase64) {

    try {

      const firma =
      cierre.firmaBase64.replace(
        /^data:image\/png;base64,/,
        ""
      );

      const buffer =
      Buffer.from(firma, "base64");

      doc.image(
        buffer,
        390,
        585,
        {
          fit: [220, 90]
        }
      );

    } catch {}
  }

  doc.moveTo(410, 695)
  .lineTo(590, 695)
  .strokeColor("#9ca3af")
  .stroke();

  doc.fillColor(COLORS.dark)
  .font("Helvetica-Bold")
  .fontSize(12)
  .text(
    bitacora.operador,
    330,
    708,
    {
      width: 340,
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