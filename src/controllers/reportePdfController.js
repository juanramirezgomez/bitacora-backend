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
   GENERAR PDF COMPLETO
===================================================== */

export const generarReportePdfInterno = async (bitacoraId) => {

  const bitacora = await Bitacora.findById(bitacoraId);
  if (!bitacora || bitacora.estado !== "CERRADA") return null;

  const { dia, mes, anioCompleto } =
  obtenerYYMMDD(bitacora.fechaInicio);

  let [checklist, registros, cierre] = await Promise.all([
    ChecklistInicial.findOne({ bitacoraId }),
    RegistroOperacion.find({ bitacoraId }),
    CierreTurno.findOne({ bitacoraId })
  ]);

  registros = ordenarPorTurno(registros, bitacora.turno);

  const { filePath } = generarInfoArchivo(bitacora, "pdf");

  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }

  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  /* HEADER */

  doc.fontSize(18)
  .text("BITÁCORA DE CONTROL DE CALDERA", { align: "center" })
  .moveDown();

  doc.fontSize(10)
  .text(`Operador: ${bitacora.operador}`)
  .text(`Turno: ${bitacora.turno} - ${bitacora.turnoNumero}`)
  .text(`Fecha: ${dia}-${mes}-${anioCompleto}`)
  .moveDown(1);

  /* CHECKLIST */

  if (checklist) {

    doc.fontSize(13)
    .text("I. CHECKLIST INICIAL", { underline: true })
    .moveDown(0.5);

    const labelsChecklist = {
      calderaHurst: "Caldera Hurst",
      bombaAlimentacionAgua: "Bomba Alimentacion Agua",
      bombaPetroleo: "Bomba Petroleo",
      nivelAguaTuboNivel: "Nivel Agua Tubo Nivel",
      purgaSuperficie: "Purga Superficie",
      bombaDosificadoraQuimicos: "Bomba Dosificadora Quimicos",
      trenGas: "Tren Gas",
      ablandadores: "Ablandadores"
    };

    Object.entries(labelsChecklist).forEach(([key, label]) => {

      let value = checklist[key] ?? "-";

      if (typeof value === "string")
        value = value.replace(/_/g, " ");

      doc.fontSize(10)
      .text(`${label}: ${value}`);

    });

    if (checklist.observacionesIniciales) {
      doc.moveDown(0.5);
      doc.text(`Observaciones: ${checklist.observacionesIniciales}`);
    }

    doc.moveDown(1);
  }

  /* REGISTRO OPERACION */

  doc.fontSize(13)
  .text("II. REGISTRO DE OPERACIÓN (LECTURAS)", { underline: true })
  .moveDown();

  if (registros.length > 0) {

    const columnasDinamicas = new Set();

    registros.forEach(reg =>
      reg.parametros?.forEach(p => columnasDinamicas.add(p.label))
    );

    const columnas = ["hora", ...Array.from(columnasDinamicas), "purgaDeFondo"];

    const nombreVisualColumnas = {
      "Temperatura gases chimenea": "Tº gases chimenea"
    };

    const tableWidth = doc.page.width - 80;
    const colWidth = tableWidth / columnas.length;
    const rowHeight = 25;

    let y = doc.y;
    let x = 40;

    doc.font("Helvetica-Bold").fontSize(8);

    columnas.forEach(col => {

      const tituloColumna = nombreVisualColumnas[col] || col;

      doc.rect(x, y, colWidth, rowHeight).stroke();

      doc.text(tituloColumna, x + 3, y + 8, {
        width: colWidth - 6,
        align: "center"
      });

      x += colWidth;
    });

    y += rowHeight;

    doc.font("Helvetica");

    registros.forEach(reg => {

      x = 40;

      columnas.forEach(col => {

        let valor = "-";

        if (col === "hora") valor = reg.hora;
        else if (col === "purgaDeFondo") valor = reg.purgaDeFondo;
        else {

          const param = reg.parametros?.find(p => p.label === col);

          if (param) valor = `${param.value} ${param.unidad}`;
        }

        doc.rect(x, y, colWidth, rowHeight).stroke();

        doc.text(String(valor), x + 3, y + 8, {
          width: colWidth - 6,
          align: "center"
        });

        x += colWidth;
      });

      y += rowHeight;

      if (y > 750) {
        doc.addPage();
        y = 50;
      }

    });

  }

  /* CIERRE + FIRMA */

  if (cierre) {

    doc.addPage();

    doc.fontSize(13)
    .text("III. CIERRE Y FIRMA", { underline: true })
    .moveDown();

    doc.fontSize(10)
    .text(`Recepción combustible: ${cierre.recepcionCombustible ?? "-"}`)
    .text(`Litros combustible: ${cierre.litrosCombustible ?? "-"}`)
    .text(`TK28 en servicio: ${cierre.tk28EnServicio ?? "-"}`)
    .text(`% TK28: ${cierre.tk28Porcentaje ?? "-"}`)
    .moveDown(2);

    if (cierre.comentariosFinales) {
      doc.text(`Observaciones: ${cierre.comentariosFinales}`);
    }

    if (cierre.firmaBase64) {

      try {

        const firmaBase64 =
        cierre.firmaBase64.replace(/^data:image\/png;base64,/, "");

        const firmaBuffer =
        Buffer.from(firmaBase64, "base64");

        doc.image(firmaBuffer, {
          fit: [250, 120],
          align: "center"
        });

        doc.moveDown();
        doc.text("Firma operador", { align: "center" });

      } catch (err) {
        console.log("Error firma:", err);
      }

    }

  }

  doc.end();

  await new Promise(resolve => stream.on("finish", resolve));

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
   EXCEL COMPLETO
===================================================== */

export const descargarReporteExcel = async (req, res) => {

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

  /* =========================
     ANCHO COLUMNAS
  ========================= */
  sheet.columns = [
    { width: 28 },
    { width: 20 },
    { width: 25 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 20 }
  ];

  /* =========================
     HEADER
  ========================= */
  sheet.mergeCells("A1:G2");

  const titleCell = sheet.getCell("A1");
  titleCell.value = "CONTROL DE OPERACIONES";
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "4472C4" }
  };

  /* =========================
     INFO
  ========================= */
  const { dia, mes, anioCompleto } =
    obtenerYYMMDD(bitacora.fechaInicio);

  sheet.addRow([]);
  sheet.addRow(["Operador", bitacora.operador]);
  sheet.addRow(["Turno", bitacora.turno]);
  sheet.addRow(["N° Turno", bitacora.turnoNumero]);
  sheet.addRow(["Fecha", `${dia}-${mes}-${anioCompleto}`]);

  /* =========================
     CHECKLIST
  ========================= */
  sheet.addRow([]);
  sheet.addRow(["I. CHECKLIST INICIAL"]);

  const headerChecklist = sheet.addRow([
    "Equipo", "Estado", "Observación"
  ]);

  headerChecklist.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1F4E78" } };
    cell.alignment = { horizontal: "center" };
    cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  });

  const agregarFilaChecklist = (equipo, estado) => {
    const row = sheet.addRow([
      equipo,
      estado?.replaceAll("_", " "),
      checklist?.observacionesIniciales || "-"
    ]);

    row.eachCell((cell, colNumber) => {
      cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };

      if (colNumber === 2) {
        if (estado === "EN_SERVICIO") {
          cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:"C6EFCE"} };
        } else {
          cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:"FFC7CE"} };
        }
      }
    });
  };

  if (checklist) {
    agregarFilaChecklist("Caldera Hurst", checklist.calderaHurst);
    agregarFilaChecklist("Bomba Alimentación Agua", checklist.bombaAlimentacionAgua);
    agregarFilaChecklist("Bomba Petróleo", checklist.bombaPetroleo);
    agregarFilaChecklist("Nivel Agua Tubo Nivel", checklist.nivelAguaTuboNivel);
    agregarFilaChecklist("Purga Superficie", checklist.purgaSuperficie);
    agregarFilaChecklist("Bomba Dosificadora Químicos", checklist.bombaDosificadoraQuimicos);
    agregarFilaChecklist("Tren Gas", checklist.trenGas);
    agregarFilaChecklist("Ablandadores", checklist.ablandadores);
  }

  /* =========================
     REGISTROS
  ========================= */
  sheet.addRow([]);
  sheet.addRow(["II. REGISTRO DE OPERACIÓN"]);

  if (registros.length > 0) {

    const columnasDinamicas = new Set();

    registros.forEach(r =>
      r.parametros.forEach(p => columnasDinamicas.add(p.label))
    );

    const columnas = ["hora", ...Array.from(columnasDinamicas)];

    const header = sheet.addRow(columnas);

    header.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:"1F4E78"} };
      cell.alignment = { horizontal:"center" };
      cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    });

    registros.forEach(r => {

      const rowData = columnas.map(col => {
        if (col === "hora") return r.hora;

        const param = r.parametros.find(p => p.label === col);
        return param ? param.value : "-";
      });

      const row = sheet.addRow(rowData);

      row.eachCell(cell => {
        cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      });

    });
  }

  /* =========================
     CIERRE
  ========================= */
  sheet.addRow([]);
  sheet.addRow(["III. CIERRE DE TURNO"]);

  const cierreHeader = sheet.addRow(["Campo", "Valor", "Observación"]);

  cierreHeader.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:"1F4E78"} };
    cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
  });

  if (cierre) {

    const add = (campo, valor) => {
      const row = sheet.addRow([
        campo,
        valor ?? "-",
        cierre.comentariosFinales || "-"
      ]);

      row.eachCell(cell => {
        cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
      });
    };

    add("Recepción combustible", cierre.recepcionCombustible);
    add("Litros combustible", cierre.litrosCombustible);
    add("TK28 en servicio", cierre.tk28EnServicio);
    add("% TK28", cierre.tk28Porcentaje);
  }

  /* =========================
     EXPORTAR
  ========================= */
  const { nombre, filePath } = generarInfoArchivo(bitacora, "xlsx");

  await workbook.xlsx.writeFile(filePath);

  return res.download(filePath, nombre);
};