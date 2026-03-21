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
  try {
    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findById(bitacoraId);
    if (!bitacora) return res.status(404).json({ error: "No encontrada" });

    let [checklist, registros, cierre] = await Promise.all([
      ChecklistInicial.findOne({ bitacoraId }),
      RegistroOperacion.find({ bitacoraId }),
      CierreTurno.findOne({ bitacoraId })
    ]);

    registros = ordenarPorTurno(registros, bitacora.turno);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Bitacora");

    // ==========================================
    // CONFIG COLUMNAS 🔥
    // ==========================================
    sheet.columns = [
      { width: 30 },
      { width: 18 },
      { width: 35 },
      { width: 18 },
      { width: 20 },
      { width: 20 },
      { width: 20 },
      { width: 20 }
    ];

    let rowIndex = 1;

    // ==========================================
    // HEADER
    // ==========================================
    sheet.mergeCells("A1:H2");
    const header = sheet.getCell("A1");
    header.value = "CALDERA HURST";
    header.alignment = { horizontal: "center", vertical: "middle" };
    header.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "4472C4" }
    };

    rowIndex = 4;

    const { dia, mes, anioCompleto } = obtenerYYMMDD(bitacora.fechaInicio);

    const datos = [
      ["Operador", bitacora.operador],
      ["Turno", bitacora.turno],
      ["N° Turno", bitacora.turnoNumero],
      ["Fecha", `${dia}-${mes}-${anioCompleto}`]
    ];

    datos.forEach(d => {
      const row = sheet.getRow(rowIndex++);
      row.getCell(1).value = d[0];
      row.getCell(2).value = d[1];

      row.eachCell(cell => {
        cell.border = { top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"} };
        cell.alignment = { vertical:"middle", horizontal:"left" };
      });
    });

    rowIndex++;

    // ==========================================
    // CHECKLIST
    // ==========================================
    sheet.getCell(`A${rowIndex}`).value = "I. CHECKLIST INICIAL";
    rowIndex++;

    const headerRow = sheet.getRow(rowIndex++);
    ["Equipo","Estado"].forEach((t,i)=>{
      const cell = headerRow.getCell(i+1);
      cell.value = t;
      cell.font = { bold:true, color:{argb:"FFFFFFFF"} };
      cell.fill = { type:"pattern",pattern:"solid",fgColor:{argb:"1F4E78"} };
      cell.alignment = { horizontal:"center" };
      cell.border = { top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"} };
    });

    const filasChecklist = [
      ["Caldera Hurst", checklist.calderaHurst],
      ["Bomba Alimentación Agua", checklist.bombaAlimentacionAgua],
      ["Bomba Petróleo", checklist.bombaPetroleo],
      ["Nivel Agua Tubo Nivel", checklist.nivelAguaTuboNivel],
      ["Purga Superficie", checklist.purgaSuperficie],
      ["Bomba Dosificadora Químicos", checklist.bombaDosificadoraQuimicos],
      ["Tren Gas", checklist.trenGas],
      ["Ablandadores", checklist.ablandadores]
    ];

    filasChecklist.forEach(f => {
      const row = sheet.getRow(rowIndex++);
      row.getCell(1).value = f[0];
      row.getCell(2).value = f[1].replace(/_/g," ");

      // estilos
      row.eachCell((cell, col) => {
        cell.border = { top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"} };
        cell.alignment = {
          vertical:"middle",
          horizontal: col === 1 ? "left" : "center",
          wrapText:true
        };
      });

      // colores 🔥
      if (f[1] === "EN_SERVICIO" || f[1] === "NORMAL") {
        row.getCell(2).fill = { type:"pattern",pattern:"solid",fgColor:{argb:"C6EFCE"} };
      }
      if (f[1] === "FUERA_DE_SERVICIO" || f[1] === "BAJO") {
        row.getCell(2).fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFC7CE"} };
      }
    });

    // Observaciones checklist
    rowIndex++;
    sheet.getCell(`A${rowIndex}`).value = "Observaciones";
    sheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
    rowIndex++;

    sheet.mergeCells(`A${rowIndex}:C${rowIndex+2}`);
    const obs = sheet.getCell(`A${rowIndex}`);
    obs.value = checklist.observacionesIniciales || "-";
    obs.alignment = { wrapText:true };

    rowIndex += 4;

    // ==========================================
    // REGISTRO OPERACION
    // ==========================================
    sheet.getCell(`A${rowIndex}`).value = "II. REGISTRO DE OPERACIÓN";
    rowIndex++;

    const columnas = ["Hora","Presión caldera","Vapor","Temp. gases","Nivel TK","Consumo","Flujo","Temp ITC"];

    const rowHeader = sheet.getRow(rowIndex++);
    columnas.forEach((c,i)=>{
      const cell = rowHeader.getCell(i+1);
      cell.value = c;
      cell.font = { bold:true, color:{argb:"FFFFFFFF"} };
      cell.fill = { type:"pattern",pattern:"solid",fgColor:{argb:"1F4E78"} };
      cell.alignment = { horizontal:"center" };
      cell.border = { top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"} };
    });

    registros.forEach(r=>{
      const row = sheet.getRow(rowIndex++);
      const get = label => r.parametros?.find(p=>p.label===label);

      row.values = [
        r.hora,
        get("Presión caldera")?.value + " bar",
        get("Vapor")?.value + " T/H",
        get("Temperatura gases chimenea")?.value + " °C",
        get("Nivel TK combustible")?.value + " %",
        get("Consumo combustible")?.value,
        get("Flujo bomba 41")?.value,
        get("Temperatura salida ITC")?.value + " °C"
      ];

      row.eachCell(cell=>{
        cell.border = { top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"} };
        cell.alignment = { horizontal:"center", wrapText:true };
      });
    });

    rowIndex++;

    // ==========================================
    // CIERRE
    // ==========================================
    sheet.getCell(`A${rowIndex}`).value = "III. CIERRE DE TURNO";
    rowIndex++;

    const cierreDatos = [
      ["Recepción combustible", cierre.recepcionCombustible],
      ["Litros combustible", cierre.litrosCombustible],
      ["TK28 en servicio", cierre.tk28EnServicio],
      ["% TK28", cierre.tk28Porcentaje]
    ];

    cierreDatos.forEach(d=>{
      const row = sheet.getRow(rowIndex++);
      row.getCell(1).value = d[0];
      row.getCell(2).value = d[1];

      row.eachCell(cell=>{
        cell.border = { top:{style:"thin"},left:{style:"thin"},bottom:{style:"thin"},right:{style:"thin"} };
      });
    });

    // Observaciones finales
    rowIndex++;
    sheet.getCell(`A${rowIndex}`).value = "Observaciones Finales";
    sheet.mergeCells(`A${rowIndex}:C${rowIndex}`);
    rowIndex++;

    sheet.mergeCells(`A${rowIndex}:C${rowIndex+2}`);
    sheet.getCell(`A${rowIndex}`).value = cierre.comentariosFinales || "-";

    // ==========================================
    // GUARDAR
    // ==========================================
    const { nombre, filePath } = generarInfoArchivo(bitacora, "xlsx");

    await workbook.xlsx.writeFile(filePath);

    return res.download(filePath, nombre);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error generando Excel" });
  }
};