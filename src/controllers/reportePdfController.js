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
      "Temperatura gases chimenea": "Tº gases"
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
    .text(`% TK de agua blanda: ${cierre.tk28Porcentaje ?? "-"}`)
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
   DESCARGAR EXCEL
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

    sheet.pageSetup = { orientation: "landscape", fitToWidth: 1 };

    /* ===== COLORES ===== */
    const azul = "FF1F4E78";
    const azulClaro = "FFD9E1F2";
    const verde = "FFC6EFCE";
    const rojo = "FFFFC7CE";
    const gris = "FFF7F7F7";

    const borde = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    };

    const center = { horizontal: "center", vertical: "middle", wrapText: true };
    const left = { horizontal: "left", vertical: "middle", wrapText: true };

    let rowIndex = 1;

    /* ===== HEADER ===== */
    sheet.mergeCells("A1:N2");
    const header = sheet.getCell("A1");
    header.value = "REPORTE OPERACIONAL CALDERA";
    header.font = { size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = center;
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };

    rowIndex = 4;

    const { dia, mes, anioCompleto } = obtenerYYMMDD(bitacora.fechaInicio);

    [
      ["Operador", bitacora.operador],
      ["Turno", `${bitacora.turno} - ${bitacora.turnoNumero}`],
      ["Fecha", `${dia}-${mes}-${anioCompleto}`]
    ].forEach(d => {
      const row = sheet.getRow(rowIndex++);
      row.getCell(1).value = d[0];
      row.getCell(2).value = d[1];

      row.getCell(1).font = { bold: true };
      row.eachCell(c => {
        c.border = borde;
        c.alignment = left;
      });
    });

    rowIndex++;

    /* ===== CHECKLIST ===== */
    sheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
    let cell = sheet.getCell(`A${rowIndex}`);
    cell.value = "CHECKLIST INICIAL";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = center;

    rowIndex++;

    const checklistData = [
      ["Caldera", checklist?.calderaHurst],
      ["BBA Agua", checklist?.bombaAlimentacionAgua],
      ["BBA Petróleo", checklist?.bombaPetroleo],
      ["Nivel Agua", checklist?.nivelAguaTuboNivel],
      ["Purga", checklist?.purgaSuperficie],
      ["Dosificación", checklist?.bombaDosificadoraQuimicos],
      ["Tren Gas", checklist?.trenGas],
      ["Ablandadores", checklist?.ablandadores]
    ];

    checklistData.forEach((f, i) => {
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
      if (["EN_SERVICIO", "NORMAL", "LLENO"].includes(estadoRaw)) {
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: verde } };
      }

      if (["FUERA_DE_SERVICIO", "BAJO"].includes(estadoRaw)) {
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: rojo } };
      }

      if (i % 2 === 0) {
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: gris } };
      }
    });

    rowIndex += 2;

    /* ===== REGISTRO ===== */
    sheet.mergeCells(`A${rowIndex}:N${rowIndex}`);
    cell = sheet.getCell(`A${rowIndex}`);
    cell.value = "REGISTRO DE OPERACIÓN";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azul } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    cell.alignment = center;

    rowIndex++;

    const columnas = [
      "Hora","P","V","F.Al","Tot.Al","T.Gas",
      "%D","F.Bl","Tot.Bl","B41","Tot41","Cons","T.ITC"
    ];

    sheet.columns = columnas.map(() => ({ width: 10 }));

    const headerRow = sheet.getRow(rowIndex++);
    columnas.forEach((c, i) => {
      const celda = headerRow.getCell(i + 1);
      celda.value = c;
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: azulClaro } };
      celda.font = { bold: true };
      celda.border = borde;
      celda.alignment = center;
    });

    /* 🔥 FUNCIÓN ROBUSTA */
    const normalizar = (txt) =>
      txt?.toLowerCase()
         .normalize("NFD")
         .replace(/[\u0300-\u036f]/g, "")
         .trim();

    const getVal = (r, labelBuscado) => {
      const buscado = normalizar(labelBuscado);

      const p = r.parametros?.find(x =>
        normalizar(x.label).includes(buscado)
      );

      return p ? p.value : "-";
    };

    registros.forEach((r, idx) => {
      const row = sheet.getRow(rowIndex++);

      row.values = [
        r.hora || "-",
        getVal(r,"presion"),
        getVal(r,"vapor"),
        getVal(r,"flujo alimentacion"),
        getVal(r,"totalizador alimentacion"),
        getVal(r,"temperatura gases"),
        getVal(r,"diesel"),
        getVal(r,"agua blanda"),
        getVal(r,"totalizador agua blanda"),
        getVal(r,"bba41"),
        getVal(r,"totalizador bba41"),
        getVal(r,"consumo"),
        getVal(r,"itc")
      ];

      row.eachCell(c => {
        c.border = borde;
        c.alignment = center;
      });

      if (idx % 2 === 0) {
        row.eachCell(c => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gris } };
        });
      }
    });

    /* ===== EXPORT ===== */
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Disposition", `attachment; filename=bitacora_${bitacora.turnoNumero}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    res.send(buffer);

  } catch (error) {
    console.error("ERROR EXCEL:", error);
    res.status(500).json({ error: "Error generando Excel" });
  }
};

async function obtenerRegistrosPorRango(desde, hasta) {

  const inicio = new Date(desde);
  const fin = new Date(hasta);

  fin.setHours(23,59,59,999);

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

      todosRegistros.push({
        fecha: `${fecha.dia}-${fecha.mes}-${fecha.anioCompleto}`,
        hora: r.hora,
        parametros: r.parametros,
        purgaDeFondo: r.purgaDeFondo
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
    const sheet = workbook.addWorksheet("Rango");

    /* ===== COLORES ===== */
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
      r.parametros?.forEach(p => columnasSet.add(p.label))
    );

    const columnas = [
      "Fecha",
      "Hora",
      ...Array.from(columnasSet),
      "Purga de fondo"
    ];

    /* ===== HEADER ===== */
    const header = sheet.addRow(columnas);

    header.eachCell(cell => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: azul }
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = center;
      cell.border = borde;
    });

    /* ===== FILAS ===== */
    registros.forEach(r => {

      const fila = [];

      fila.push(r.fecha);
      fila.push(r.hora);

      columnas.slice(2, -1).forEach(col => {
        const p = r.parametros?.find(x => x.label === col);
        fila.push(p ? `${p.value} ${p.unidad}` : "-");
      });

      fila.push(r.purgaDeFondo || "-");

      const row = sheet.addRow(fila);

      row.eachCell(cell => {
        cell.border = borde;
        cell.alignment = center;
      });

    });

    /* AUTO WIDTH */
    sheet.columns.forEach(col => col.width = 18);

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

    /* ===== COLUMNAS DINÁMICAS ===== */
    const columnasSet = new Set();

    registros.forEach(r =>
      r.parametros?.forEach(p => columnasSet.add(p.label))
    );

    const columnas = [
      "Fecha",
      "Hora",
      ...Array.from(columnasSet),
      "Purga"
    ];

    const tableWidth = doc.page.width - 80;
    const colWidth = tableWidth / columnas.length;
    const rowHeight = 20;

    let y = doc.y;

    /* ===== HEADER ===== */
    doc.font("Helvetica-Bold").fontSize(7);

    columnas.forEach((col, i) => {
      doc.rect(40 + i * colWidth, y, colWidth, rowHeight)
        .fillAndStroke("#1F4E78", "#000");

      doc.fillColor("white").text(col, 40 + i * colWidth + 2, y + 6, {
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
          const p = r.parametros?.find(x => x.label === col);
          if (p) val = `${p.value} ${p.unidad}`;
        }

        doc.fillColor("black");

        doc.rect(40 + i * colWidth, y, colWidth, rowHeight).stroke();

        doc.text(val, 40 + i * colWidth + 2, y + 6, {
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