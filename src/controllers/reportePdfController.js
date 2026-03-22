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
     ANCHOS DE COLUMNAS
  ========================= */
  sheet.columns = [
    { width: 22 }, // A
    { width: 22 }, // B
    { width: 22 }, // C
    { width: 22 }, // D
    { width: 22 }, // E
    { width: 22 }, // F
    { width: 22 }, // G
    { width: 22 }, // H
  ];

  /* =========================
     HEADER
  ========================= */
  const header = sheet.addRow(["CALDERA HURST"]);
  sheet.mergeCells(`A${header.number}:H${header.number}`);
  header.font = { bold: true, size: 14 };
  header.alignment = { horizontal: "center" };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFBDD7EE" }
  };

  sheet.addRow([]);

  /* =========================
     DATOS GENERALES (TABLA)
  ========================= */
  const turnoSeguro =
    ["DIA", "NOCHE"].includes(bitacora.turno)
      ? bitacora.turno
      : "NOCHE";

  const datos = [
    ["Operador", bitacora.operador],
    ["Turno", `${turnoSeguro} - ${bitacora.turnoNumero}`]
  ];

  datos.forEach(d => {
    const row = sheet.addRow(d);
    row.eachCell(c => {
      c.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };
    });
  });

  sheet.addRow([]);

  /* =========================
     CHECKLIST
  ========================= */
  const rowTitle = sheet.addRow(["CHECKLIST INICIAL"]);
  sheet.mergeCells(`A${rowTitle.number}:H${rowTitle.number}`);
  rowTitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFBDD7EE" }
  };

  const labelsChecklist = {
    calderaHurst: "Caldera Hurst",
    bombaAlimentacionAgua: "Bomba Alimentación Agua",
    bombaPetroleo: "Bomba Petróleo",
    nivelAguaTuboNivel: "Nivel Agua Tubo Nivel",
    purgaSuperficie: "Purga Superficie",
    bombaDosificadoraQuimicos: "Bomba Dosificadora Químicos",
    trenGas: "Tren de Gas",
    ablandadores: "Ablandadores"
  };

  Object.entries(labelsChecklist).forEach(([key, label]) => {

    let value = checklist?.[key] || "-";

    if (typeof value === "string") value = value.replace(/_/g, " ");

    const row = sheet.addRow([label, value]);

    row.eachCell((c, col) => {
      c.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };

      // 🎯 COLOR ESPECIAL NIVEL
      if (key === "nivelAguaTuboNivel" && col === 2) {
        if (value === "BAJO") {
          c.font = { color: { argb: "FFFF0000" }, bold: true };
        }
        if (value === "NORMAL") {
          c.font = { color: { argb: "FF008000" }, bold: true };
        }
      }
    });
  });

  /* =========================
     OBSERVACIONES CHECKLIST
  ========================= */
  const obsTexto = checklist?.observacionesIniciales || "-";
  const obsLineas = obsTexto.split("\n").length;

  const obsRow = sheet.addRow(["OBSERVACIONES", obsTexto]);

  sheet.mergeCells(`B${obsRow.number}:H${obsRow.number}`);

  obsRow.height = Math.max(40, obsLineas * 15);

  obsRow.getCell(2).alignment = {
    wrapText: true,
    vertical: "top"
  };

  obsRow.eachCell(c => {
    c.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" }
    };
  });

  sheet.addRow([]);

  /* =========================
     REGISTRO OPERACION
  ========================= */
  const regTitle = sheet.addRow(["REGISTRO DE OPERACIÓN"]);
  sheet.mergeCells(`A${regTitle.number}:H${regTitle.number}`);
  regTitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFBDD7EE" }
  };

  if (registros.length > 0) {

    const columnasDinamicas = new Set();

    registros.forEach(r =>
      r.parametros?.forEach(p => columnasDinamicas.add(p.label))
    );

    const columnas = ["hora", ...Array.from(columnasDinamicas), "purgaDeFondo"];

    const headers = columnas.slice(0, 8); // 🔥 límite pantalla

    const headerRow = sheet.addRow(headers);

    headerRow.eachCell(c => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9E1F2" }
      };
      c.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };
    });

    registros.forEach(reg => {

      const rowData = headers.map(col => {

        if (col === "hora") return reg.hora;
        if (col === "purgaDeFondo") return reg.purgaDeFondo;

        const p = reg.parametros?.find(x => x.label === col);

        return p ? `${p.value} ${p.unidad}` : "-";
      });

      const row = sheet.addRow(rowData);

      row.eachCell(c => {
        c.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" }
        };
      });

    });
  }

  sheet.addRow([]);

  /* =========================
     CIERRE
  ========================= */
  const cierreTitle = sheet.addRow(["CIERRE DE TURNO"]);
  sheet.mergeCells(`A${cierreTitle.number}:H${cierreTitle.number}`);
  cierreTitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFBDD7EE" }
  };

  const cierreDatos = [
    ["Recepción combustible", cierre?.recepcionCombustible || "-"],
    ["Litros combustible", cierre?.litrosCombustible || "-"],
    ["TK agua blanda en servicio", cierre?.tk28EnServicio || "-"],
    ["% TK de agua blanda", cierre?.tk28Porcentaje || "-"]
  ];

  cierreDatos.forEach(d => {
    const row = sheet.addRow(d);

    row.eachCell(c => {
      c.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      };
    });
  });

  /* =========================
     OBSERVACIONES FINALES
  ========================= */
  const textoFinal = cierre?.comentariosFinales || "-";
  const lineasFinal = textoFinal.split("\n").length;

  const rowFinal = sheet.addRow(["OBSERVACIONES FINALES", textoFinal]);

  sheet.mergeCells(`B${rowFinal.number}:H${rowFinal.number}`);

  rowFinal.height = Math.max(40, lineasFinal * 15);

  rowFinal.getCell(2).alignment = {
    wrapText: true,
    vertical: "top"
  };

  rowFinal.eachCell(c => {
    c.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" }
    };
  });

  /* =========================
     GUARDAR
  ========================= */
  const { nombre, filePath } = generarInfoArchivo(bitacora, "xlsx");

  await workbook.xlsx.writeFile(filePath);

  return res.download(filePath, nombre);
};