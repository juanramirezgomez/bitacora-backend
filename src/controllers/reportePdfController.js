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
   EXCEL COMPLETO
===================================================== */
export const descargarReporteExcel = async (req, res) => {
  try {

    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findById(bitacoraId);
    const checklist = await ChecklistInicial.findOne({ bitacoraId });
    const registros = await RegistroOperacion.find({ bitacoraId }).sort({ createdAt: 1 });
    const cierre = await CierreTurno.findOne({ bitacoraId });

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bitácora');

    /* =========================================
       CONFIGURAR COLUMNAS
    ========================================= */

    sheet.columns = [
      { header: '', key: 'a', width: 3 },
      { header: '', key: 'b', width: 28 },
      { header: '', key: 'c', width: 18 },
      { header: '', key: 'd', width: 18 },
      { header: '', key: 'e', width: 18 },
      { header: '', key: 'f', width: 18 },
      { header: '', key: 'g', width: 18 },
      { header: '', key: 'h', width: 18 }
    ];

    /* =========================================
       FUNCIONES DE ESTILO
    ========================================= */

    const azul = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    const verde = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC6EFCE' }
    };

    const rojo = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC7CE' }
    };

    const borde = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    const centrar = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true
    };

    const izquierda = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true
    };

    const estadoColor = (valor) => {
      if (!valor) return {};

      if (valor === 'EN_SERVICIO' || valor === 'NORMAL') return verde;
      if (valor === 'FUERA_DE_SERVICIO' || valor === 'BAJO') return rojo;

      return {};
    };

    let row = 1;

    /* =========================================
       HEADER
    ========================================= */

    sheet.mergeCells(`B${row}:H${row}`);
    const titulo = sheet.getCell(`B${row}`);
    titulo.value = 'REPORTE OPERACIÓN CALDERA HURST';
    titulo.font = { bold: true, size: 16 };
    titulo.alignment = centrar;

    row++;

    sheet.mergeCells(`B${row}:H${row}`);
    const fecha = sheet.getCell(`B${row}`);
    fecha.value = `Fecha: ${new Date(bitacora.fechaInicio).toLocaleDateString('es-CL')}`;
    fecha.font = { bold: true };
    fecha.alignment = centrar;

    row += 2;

    /* =========================================
       CHECKLIST INICIAL
    ========================================= */

    sheet.mergeCells(`B${row}:H${row}`);
    const tituloChecklist = sheet.getCell(`B${row}`);
    tituloChecklist.value = 'CHECKLIST INICIAL';
    tituloChecklist.fill = azul;
    tituloChecklist.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    tituloChecklist.alignment = centrar;

    row++;

    const items = [
      ['Condición del Equipo', checklist?.condicionEquipo],
      ['Caldera Hurst', checklist?.calderaHurst],
      ['Bomba Alimentación Agua', checklist?.bombaAlimentacionAgua],
      ['Bomba Petróleo', checklist?.bombaPetroleo],
      ['Purga Superficie', checklist?.purgaSuperficie],
      ['Bomba Dosificadora Químicos', checklist?.bombaDosificadoraQuimicos],
      ['Tren de Gas', checklist?.trenGas],
      ['Ablandadores', checklist?.ablandadores],
      ['Nivel Agua Tubo de Nivel', checklist?.nivelAguaTuboNivel]
    ];

    items.forEach(([nombre, valor]) => {

      const r = sheet.getRow(row);

      r.getCell('B').value = nombre;
      r.getCell('C').value = valor || '-';

      r.getCell('B').alignment = izquierda;
      r.getCell('C').alignment = centrar;

      r.getCell('C').fill = estadoColor(valor);

      r.getCell('B').border = borde;
      r.getCell('C').border = borde;

      row++;
    });

    /* =========================================
       OBSERVACIONES
    ========================================= */

    row += 2;

    sheet.mergeCells(`B${row}:H${row}`);
    const obsTitle = sheet.getCell(`B${row}`);
    obsTitle.value = 'OBSERVACIONES';
    obsTitle.fill = azul;
    obsTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    obsTitle.alignment = centrar;

    row++;

    sheet.mergeCells(`B${row}:H${row}`);
    const obs = sheet.getCell(`B${row}`);
    obs.value = checklist?.observacionesIniciales || '-';
    obs.alignment = { wrapText: true };
    obs.border = borde;

    sheet.getRow(row).height = 60;

    /* =========================================
       REGISTRO OPERACIÓN
    ========================================= */

    row += 3;

    sheet.mergeCells(`B${row}:H${row}`);
    const tituloRegistro = sheet.getCell(`B${row}`);
    tituloRegistro.value = 'REGISTRO DE OPERACIÓN';
    tituloRegistro.fill = azul;
    tituloRegistro.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    tituloRegistro.alignment = centrar;

    row++;

    const headers = [
      'Hora',
      'Presión (bar)',
      'Vapor (T/H)',
      'Temp ITC (°C)',
      'Temp TK-23 (°C)'
    ];

    headers.forEach((h, i) => {
      const cell = sheet.getRow(row).getCell(i + 2);
      cell.value = h;
      cell.fill = azul;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = centrar;
      cell.border = borde;
    });

    row++;

    registros.forEach(rg => {

      const r = sheet.getRow(row);

      r.getCell(2).value = rg.hora || '-';
      r.getCell(3).value = `${rg.presionCaldera || ''} bar`;
      r.getCell(4).value = `${rg.vaporGenerado || ''} T/H`;
      r.getCell(5).value = `${rg.temperaturaITC || ''} °C`;
      r.getCell(6).value = `${rg.temperaturaTK23 || ''} °C`;

      for (let i = 2; i <= 6; i++) {
        r.getCell(i).border = borde;
        r.getCell(i).alignment = centrar;
      }

      row++;
    });

    /* =========================================
       CIERRE
    ========================================= */

    row += 3;

    sheet.mergeCells(`B${row}:H${row}`);
    const tituloCierre = sheet.getCell(`B${row}`);
    tituloCierre.value = 'CIERRE DE TURNO';
    tituloCierre.fill = azul;
    tituloCierre.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    tituloCierre.alignment = centrar;

    row++;

    const cierreItems = [
      ['Recepción de Combustible', cierre?.recepcionCombustible],
      ['Litros Combustible', cierre?.litrosCombustible],
      ['% TK de Agua Blanda', cierre?.tk28Porcentaje]
    ];

    cierreItems.forEach(([nombre, valor]) => {

      const r = sheet.getRow(row);

      r.getCell('B').value = nombre;
      r.getCell('C').value = valor ?? '-';

      r.getCell('B').border = borde;
      r.getCell('C').border = borde;

      row++;
    });

    /* =========================================
       OBSERVACIONES FINALES
    ========================================= */

    row += 2;

    sheet.mergeCells(`B${row}:H${row}`);
    const obsFinalTitle = sheet.getCell(`B${row}`);
    obsFinalTitle.value = 'OBSERVACIONES FINALES';
    obsFinalTitle.fill = azul;
    obsFinalTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    obsFinalTitle.alignment = centrar;

    row++;

    sheet.mergeCells(`B${row}:H${row}`);
    const obsFinal = sheet.getCell(`B${row}`);
    obsFinal.value = cierre?.comentariosFinales || '-';
    obsFinal.alignment = { wrapText: true };
    obsFinal.border = borde;

    sheet.getRow(row).height = 80;

    /* =========================================
       EXPORTAR
    ========================================= */

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=bitacora_${bitacora.turnoNumero}.xlsx`
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.send(buffer);

  } catch (error) {
    console.error("Error Excel:", error);
    res.status(500).json({ message: 'Error generando Excel' });
  }
};