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
   GENERAR NOMBRE Y RUTA POR AÑO + MES (ÚNICO)
   bitacora-DD-MM-YY-turno-HHMM-id.ext
===================================================== */

function generarInfoArchivo(bitacora, extension) {
  const { dia, mes, anioCompleto, anioCorto } = obtenerYYMMDD(bitacora.fechaInicio);
  const turno = (bitacora.turno || "").toLowerCase();

  const hhmm = obtenerHHMM(bitacora.fechaCierre);
  const idCorto = String(bitacora._id).slice(-6);

  const nombre = `bitacora-${dia}-${mes}-${anioCorto}-${turno}-${hhmm}-${idCorto}.${extension}`;

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
   GENERAR PDF
===================================================== */

export const generarReportePdfInterno = async (bitacoraId) => {
  const bitacora = await Bitacora.findById(bitacoraId);
  if (!bitacora || bitacora.estado !== "CERRADA") return null;

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

  doc.fontSize(18)
    .text("BITÁCORA DE CONTROL DE CALDERA", { align: "center" })
    .moveDown();

  doc.fontSize(10)
    .text(`Operador: ${bitacora.operador}`)
    .text(`Turno: ${bitacora.turno} - ${bitacora.turnoNumero}`)
    .text(`Fecha: ${dia}-${mes}-${anioCompleto}`)
    .moveDown(1);

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
      trenGas: "TrenGas",
      ablandadores: "Ablandadores"
    };

    Object.entries(labelsChecklist).forEach(([key, label]) => {
      let value = checklist[key] ?? "-";
      if (typeof value === "string") value = value.replace(/_/g, " ");
      doc.fontSize(10).text(`${label}: ${value}`);
    });

    doc.moveDown(1);
  }

  doc.fontSize(13)
    .text("II. REGISTRO DE OPERACIÓN (LECTURAS)", { underline: true })
    .moveDown();

  if (registros.length > 0) {
    const columnasDinamicas = new Set();
    registros.forEach(reg => reg.parametros?.forEach(p => columnasDinamicas.add(p.label)));

    const columnas = ["hora", ...Array.from(columnasDinamicas), "purgaDeFondo"];

    const nombreVisualColumnas = {
      "Temperatura gases chimenea": "Tº gases chiminea"
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
      .moveDown();

    if (cierre.comentariosFinales) {
      doc.text("Comentarios finales:");
      doc.moveDown(0.5);
      doc.text(cierre.comentariosFinales);
      doc.moveDown(2);
    }

    if (cierre.firmaBase64) {
      const firmaBase64 = cierre.firmaBase64.replace(/^data:image\/png;base64,/, "");
      const firmaBuffer = Buffer.from(firmaBase64, "base64");

      const boxWidth = 250;
      const boxHeight = 120;
      const centerX = (doc.page.width - boxWidth) / 2;
      const yFirma = doc.y + 30;

      doc.rect(centerX, yFirma, boxWidth, boxHeight).stroke();

      doc.image(firmaBuffer, centerX + 10, yFirma + 10, {
        fit: [boxWidth - 20, boxHeight - 20],
        align: "center"
      });

      doc.moveDown(8);
      doc.fontSize(10).text("Firma Operador", { align: "center" });
    }
  }

  doc.end();
  await new Promise(resolve => stream.on("finish", resolve));

  return filePath;
};

/* =====================================================
   DESCARGA PDF
===================================================== */

export const descargarReportePdf = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findById(bitacoraId);
    if (!bitacora) {
      return res.status(404).json({ error: "No encontrada" });
    }

    if (bitacora.estado !== "CERRADA") {
      return res.status(400).json({ error: "La bitácora debe estar cerrada" });
    }

    const [checklist, registros, cierre] = await Promise.all([
      ChecklistInicial.findOne({ bitacoraId }),
      RegistroOperacion.find({ bitacoraId }),
      CierreTurno.findOne({ bitacoraId })
    ]);

    registros.sort((a, b) => a.hora.localeCompare(b.hora));

    const doc = new PDFDocument({ size: "A4", margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=bitacora.pdf");

    doc.pipe(res);

    const { dia, mes, anioCompleto } = obtenerYYMMDD(bitacora.fechaInicio);

    doc.fontSize(18)
      .text("BITÁCORA DE CONTROL DE CALDERA", { align: "center" })
      .moveDown();

    doc.fontSize(10)
      .text(`Operador: ${bitacora.operador}`)
      .text(`Turno: ${bitacora.turno} - ${bitacora.turnoNumero}`)
      .text(`Fecha: ${dia}-${mes}-${anioCompleto}`)
      .moveDown();

    if (checklist) {
      doc.fontSize(13).text("I. CHECKLIST INICIAL", { underline: true }).moveDown();
      Object.entries(checklist.toObject()).forEach(([key, value]) => {
        if (key !== "_id" && key !== "bitacoraId" && key !== "__v") {
          doc.fontSize(10).text(`${key}: ${value}`);
        }
      });
      doc.moveDown();
    }

    doc.fontSize(13).text("II. REGISTRO DE OPERACIÓN").moveDown();

    registros.forEach(reg => {
      doc.fontSize(10).text(`Hora: ${reg.hora}`);
      reg.parametros?.forEach(p => {
        doc.text(`  ${p.label}: ${p.value} ${p.unidad}`);
      });
      doc.moveDown(0.5);
    });

    if (cierre) {
      doc.addPage();
      doc.fontSize(13).text("III. CIERRE").moveDown();
      doc.fontSize(10)
        .text(`Recepción combustible: ${cierre.recepcionCombustible ?? "-"}`)
        .text(`Litros combustible: ${cierre.litrosCombustible ?? "-"}`)
        .text(`TK28 en servicio: ${cierre.tk28EnServicio ?? "-"}`)
        .text(`% TK28: ${cierre.tk28Porcentaje ?? "-"}`);
    }

    doc.end();

  } catch (error) {
    console.error("🔥 ERROR PDF:", error);
    return res.status(500).json({ error: "Error generando PDF" });
  }
};

/* =====================================================
   DESCARGA EXCEL (CORREGIDO getRange)
===================================================== */

export const descargarReporteExcel = async (req, res) => {
  const { bitacoraId } = req.params;

  const bitacora = await Bitacora.findById(bitacoraId);
  if (!bitacora) return res.status(404).json({ error: "No encontrada" });

  let [registros, checklist, cierre] = await Promise.all([
    RegistroOperacion.find({ bitacoraId }),
    ChecklistInicial.findOne({ bitacoraId }),
    CierreTurno.findOne({ bitacoraId })
  ]);

  registros = ordenarPorTurno(registros, bitacora.turno);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Bitacora");

  const borderMediumBlack = {
    top: { style: "medium", color: { argb: "FF000000" } },
    left: { style: "medium", color: { argb: "FF000000" } },
    bottom: { style: "medium", color: { argb: "FF000000" } },
    right: { style: "medium", color: { argb: "FF000000" } }
  };

  const borderThinBlack = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } }
  };

  // ✅ CORRECTO: aplicar borde manual sin getRange
  function applyRangeBorder(ref, border) {
    const [start, end] = ref.split(":");
    const startCell = sheet.getCell(start);
    const endCell = sheet.getCell(end);

    for (let r = startCell.row; r <= endCell.row; r++) {
      for (let c = startCell.col; c <= endCell.col; c++) {
        sheet.getCell(r, c).border = border;
      }
    }
  }

  function styleHeaderRow(rowNumber, startCol, endCol, fillArgb = "FF1F3A5F") {
    for (let c = startCol; c <= endCol; c++) {
      const cell = sheet.getCell(rowNumber, c);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
      cell.border = borderThinBlack;
    }
  }

  function normalizeSI(value) {
    return String(value ?? "").trim().toUpperCase() === "SI" ||
           String(value ?? "").trim().toUpperCase() === "SÍ";
  }

  sheet.mergeCells("A1:H3");
  const header = sheet.getCell("A1");
  header.value = "CONTROL DE OPERACIONES";
  header.font = { size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4682B4" } };

  const { dia, mes, anioCompleto } = obtenerYYMMDD(bitacora.fechaInicio);
  const fechaTxt = `${dia}-${mes}-${anioCompleto}`;

  const infoStartRow = 5;
  const info = [
    ["Operador", bitacora.operador ?? "-"],
    ["N° Turno", bitacora.turnoNumero ?? "-"],
    ["Turno", bitacora.turno ?? "-"],
    ["Fecha", fechaTxt]
  ];

  info.forEach((pair, i) => {
    const r = infoStartRow + i;
    sheet.getCell(`A${r}`).value = pair[0];
    sheet.getCell(`B${r}`).value = pair[1];

    sheet.getCell(`A${r}`).font = { bold: true };
    sheet.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };

    sheet.getCell(`A${r}`).border = borderThinBlack;
    sheet.getCell(`B${r}`).border = borderThinBlack;
  });

  let row = infoStartRow + info.length + 2;

  sheet.mergeCells(`A${row}:H${row}`);
  sheet.getCell(`A${row}`).value = "I. CHECKLIST INICIAL";
  sheet.getCell(`A${row}`).font = { bold: true };
  row++;

  const chkHeaderRow = row;
  sheet.getCell(`A${row}`).value = "Equipo";
  sheet.getCell(`B${row}`).value = "Estado";
  sheet.getCell(`C${row}`).value = "Observación";
  styleHeaderRow(row, 1, 3, "FF0B2948");
  row++;

  const checklistLabels = {
    calderaHurst: "Caldera Hurst",
    bombaAlimentacionAgua: "Bomba Alimentación Agua",
    bombaPetroleo: "Bomba Petróleo",
    nivelAguaTuboNivel: "Nivel Agua Tubo Nivel",
    purgaSuperficie: "Purga Superficie",
    bombaDosificadoraQuimicos: "Bomba Dosificadora Químicos",
    trenGas: "Tren Gas",
    ablandadores: "Ablandadores"
  };

  if (checklist) {
    Object.entries(checklistLabels).forEach(([key, label]) => {
      let estado = checklist[key] ?? "-";
      if (typeof estado === "string") estado = estado.replace(/_/g, " ").toUpperCase();

      sheet.getCell(`A${row}`).value = label;
      sheet.getCell(`B${row}`).value = estado;
      sheet.getCell(`C${row}`).value = "";

      const estadoCell = sheet.getCell(`B${row}`);
      if (estado.includes("EN SERVICIO") || estado.includes("NORMAL")) {
        estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        estadoCell.font = { bold: true, color: { argb: "FF006100" } };
      } else if (estado.includes("FUERA DE SERVICIO")) {
        estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
        estadoCell.font = { bold: true, color: { argb: "FF9C0006" } };
      }

      sheet.getCell(`A${row}`).border = borderThinBlack;
      sheet.getCell(`B${row}`).border = borderThinBlack;
      sheet.getCell(`C${row}`).border = borderThinBlack;

      row++;
    });
  } else {
    sheet.getCell(`A${row}`).value = "(sin checklist)";
    sheet.getCell(`B${row}`).value = "-";
    sheet.getCell(`C${row}`).value = "";
    sheet.getCell(`A${row}`).border = borderThinBlack;
    sheet.getCell(`B${row}`).border = borderThinBlack;
    sheet.getCell(`C${row}`).border = borderThinBlack;
    row++;
  }

  const chkEndDataRow = row - 1;
  applyRangeBorder(`A${chkHeaderRow}:C${chkEndDataRow}`, borderMediumBlack);

  row += 1;

  sheet.mergeCells(`A${row}:H${row}`);
  sheet.getCell(`A${row}`).value = "II. REGISTRO DE OPERACIÓN (LECTURAS)";
  sheet.getCell(`A${row}`).font = { bold: true };
  row++;

  const columnasDinamicas = new Set();
  registros.forEach(reg => reg.parametros?.forEach(p => columnasDinamicas.add(p.label)));

  const columnas = ["hora", ...Array.from(columnasDinamicas), "purgaDeFondo"];

  const opHeaderRow = row;
  const headerRow = sheet.addRow(columnas);
  styleHeaderRow(opHeaderRow, 1, columnas.length, "FF1F3A5F");
  headerRow.eachCell(cell => {
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = borderThinBlack;
  });
  row++;

  registros.forEach(reg => {
    const fila = [];

    columnas.forEach(col => {
      if (col === "hora") fila.push(reg.hora);
      else if (col === "purgaDeFondo") fila.push(reg.purgaDeFondo);
      else {
        const param = reg.parametros?.find(p => p.label === col);
        fila.push(param ? param.value : null);
      }
    });

    const r = sheet.addRow(fila);
    r.eachCell(cell => {
      cell.border = borderThinBlack;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    row++;
  });

  const opEndDataRow = row - 1;
  applyRangeBorder(
    `A${opHeaderRow}:${sheet.getColumn(columnas.length).letter}${opEndDataRow}`,
    borderMediumBlack
  );

  row += 1;

  sheet.mergeCells(`A${row}:H${row}`);
  sheet.getCell(`A${row}`).value = "III. CIERRE DE TURNO";
  sheet.getCell(`A${row}`).font = { bold: true };
  row++;

  const cierreHeaderRow = row;
  sheet.getCell(`A${row}`).value = "Campo";
  sheet.getCell(`B${row}`).value = "Valor";
  sheet.getCell(`C${row}`).value = "Observación";
  styleHeaderRow(row, 1, 3, "FF0B2948");
  row++;

  const recepcion = cierre?.recepcionCombustible ?? "-";
  const litros = cierre?.litrosCombustible ?? "-";
  const tk28 = cierre?.tk28EnServicio ?? "-";
  const tk28pct = cierre?.tk28Porcentaje ?? "-";

  sheet.getCell(`A${row}`).value = "Recepción combustible";
  sheet.getCell(`B${row}`).value = recepcion;
  sheet.getCell(`C${row}`).value = "";
  sheet.getCell(`A${row}`).border = borderThinBlack;
  sheet.getCell(`B${row}`).border = borderThinBlack;
  sheet.getCell(`C${row}`).border = borderThinBlack;
  row++;

  const rLitros = row;
  sheet.getCell(`A${row}`).value = "Litros combustible";
  sheet.getCell(`B${row}`).value = litros;
  sheet.getCell(`C${row}`).value = "";
  sheet.getCell(`A${row}`).border = borderThinBlack;
  sheet.getCell(`B${row}`).border = borderThinBlack;
  sheet.getCell(`C${row}`).border = borderThinBlack;
  row++;

  sheet.getCell(`A${row}`).value = "TK28 en servicio";
  sheet.getCell(`B${row}`).value = tk28;
  sheet.getCell(`C${row}`).value = "";
  sheet.getCell(`A${row}`).border = borderThinBlack;
  sheet.getCell(`B${row}`).border = borderThinBlack;
  sheet.getCell(`C${row}`).border = borderThinBlack;
  row++;

  sheet.getCell(`A${row}`).value = "% TK28";
  sheet.getCell(`B${row}`).value = tk28pct;
  sheet.getCell(`C${row}`).value = "";
  sheet.getCell(`A${row}`).border = borderThinBlack;
  sheet.getCell(`B${row}`).border = borderThinBlack;
  sheet.getCell(`C${row}`).border = borderThinBlack;
  row++;

  const cierreEndRow = row - 1;
  applyRangeBorder(`A${cierreHeaderRow}:C${cierreEndRow}`, borderMediumBlack);

  if (normalizeSI(recepcion)) {
    sheet.getCell(`B${rLitros}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF2CC" }
    };
    sheet.getCell(`B${rLitros}`).font = { bold: true };
  }

  sheet.columns.forEach(col => { col.width = 22; });
  sheet.getColumn(1).width = 32;

  sheet.views = [{ state: "frozen", ySplit: 4 }];

  const { nombre, filePath } = generarInfoArchivo(bitacora, "xlsx");
  await workbook.xlsx.writeFile(filePath);

  return res.download(filePath, nombre);
};