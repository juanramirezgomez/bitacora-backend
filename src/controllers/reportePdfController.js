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

    /* ================= COLUMNAS (AJUSTADAS SIN SCROLL) ================= */

    sheet.columns = [
      { width: 3 },
      { width: 28 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 14 }
    ];

    /* ================= ESTILOS ================= */

    const azul = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    const verde = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    const rojo = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };

    const borde = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    const center = { vertical: 'middle', horizontal: 'center', wrapText: true };
    const left = { vertical: 'middle', horizontal: 'left', wrapText: true };

    const limpiarTexto = (txt) => txt ? txt.replace(/_/g, ' ') : '-';

    const colorEstado = (valor, tipo = '') => {
      if (!valor) return {};

      if (tipo === 'nivel') {
        return valor === 'BAJO' ? rojo : verde;
      }

      if (valor === 'EN_SERVICIO') return verde;
      if (valor === 'FUERA_DE_SERVICIO') return rojo;

      return {};
    };

    const autoHeight = (text) => {
      if (!text) return 20;
      return Math.ceil(text.length / 90) * 18;
    };

    // 🔥 FUNCIÓN CLAVE PARA ARREGLAR TU PROBLEMA
    const get = (obj, keys) => {
      for (const k of keys) {
        if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
      }
      return null;
    };

    let row = 1;

    /* ================= HEADER ================= */

    sheet.mergeCells(`B${row}:H${row}`);
    sheet.getCell(`B${row}`).value = 'REPORTE OPERACIONAL CALDERA HURST';
    sheet.getCell(`B${row}`).font = { bold: true, size: 16 };
    sheet.getCell(`B${row}`).alignment = center;

    row++;

    sheet.mergeCells(`B${row}:H${row}`);
    sheet.getCell(`B${row}`).value =
      `Operador: ${bitacora.operador} | Turno: ${bitacora.turno} - ${bitacora.turnoNumero}`;
    sheet.getCell(`B${row}`).alignment = center;

    row++;

    sheet.mergeCells(`B${row}:H${row}`);
    sheet.getCell(`B${row}`).value =
      `Fecha: ${new Date(bitacora.fechaInicio).toLocaleDateString('es-CL')}`;
    sheet.getCell(`B${row}`).alignment = center;

    row += 2;

    /* ================= CHECKLIST ================= */

    sheet.mergeCells(`B${row}:H${row}`);
    const t1 = sheet.getCell(`B${row}`);
    t1.value = 'CHECKLIST INICIAL';
    t1.fill = azul;
    t1.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    t1.alignment = center;

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
      ['Nivel Agua Tubo de Nivel', checklist?.nivelAguaTuboNivel, 'nivel']
    ];

    items.forEach(([nombre, valor, tipo]) => {
      const r = sheet.getRow(row);

      r.getCell(2).value = nombre;
      r.getCell(3).value = limpiarTexto(valor);

      r.getCell(3).fill = colorEstado(valor, tipo);

      r.getCell(2).border = borde;
      r.getCell(3).border = borde;

      row++;
    });

    /* ================= OBSERVACIONES ================= */

    row += 2;

    sheet.mergeCells(`B${row}:H${row}`);
    sheet.getCell(`B${row}`).value = 'OBSERVACIONES';
    sheet.getCell(`B${row}`).fill = azul;
    sheet.getCell(`B${row}`).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    sheet.getCell(`B${row}`).alignment = center;

    row++;

    const obs = checklist?.observacionesIniciales || '-';

    sheet.mergeCells(`B${row}:H${row}`);
    sheet.getCell(`B${row}`).value = obs;
    sheet.getCell(`B${row}`).alignment = left;
    sheet.getCell(`B${row}`).border = borde;
    sheet.getRow(row).height = autoHeight(obs);

    /* ================= REGISTRO OPERACIÓN ================= */

    row += 3;

    sheet.mergeCells(`B${row}:H${row}`);
    sheet.getCell(`B${row}`).value = 'REGISTRO DE OPERACIÓN';
    sheet.getCell(`B${row}`).fill = azul;
    sheet.getCell(`B${row}`).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    sheet.getCell(`B${row}`).alignment = center;

    row++;

    const headers = [
      'Hora', 'Presión (bar)', 'Vapor (T/H)', 'Temp Gases (°C)',
      '% Diésel', 'BBA41', 'Temp ITC (°C)'
    ];

    headers.forEach((h, i) => {
      const c = sheet.getRow(row).getCell(i + 2);
      c.value = h;
      c.fill = azul;
      c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      c.alignment = center;
      c.border = borde;
    });

    row++;

    registros.forEach(rg => {

      const r = sheet.getRow(row);

      const presion = get(rg, ['presionCaldera', 'presion']);
      const vapor = get(rg, ['vaporTH', 'vapor']);
      const tempGases = get(rg, ['tempGases', 'temperaturaGases']);
      const diesel = get(rg, ['porcentajeDiesel', 'diesel']);
      const bba = get(rg, ['bba41']);
      const itc = get(rg, ['tempITC', 'temperaturaITC']);

      r.getCell(2).value = rg.hora || '-';
      r.getCell(3).value = presion ? `${presion} bar` : '-';
      r.getCell(4).value = vapor ? `${vapor} T/H` : '-';
      r.getCell(5).value = tempGases ? `${tempGases} °C` : '-';
      r.getCell(6).value = diesel ? `${diesel} %` : '-';
      r.getCell(7).value = bba || '-';
      r.getCell(8).value = itc ? `${itc} °C` : '-';

      for (let i = 2; i <= 8; i++) {
        r.getCell(i).border = borde;
        r.getCell(i).alignment = center;
      }

      row++;
    });

    /* ================= EXPORT ================= */

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