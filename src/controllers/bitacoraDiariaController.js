import PDFDocument from "pdfkit";
import multer from "multer";
import path from "path";
import fs from "fs";
import BitacoraDiariaPC1, {
  AREAS_PC1,
  ESTADOS_BITACORA_DIARIA,
  TIPOS_NOVEDAD,
  TURNOS
} from "../models/BitacoraDiariaPC1.js";
import User from "../models/user.js";

const UPLOAD_DIR = path.join(process.cwd(), "src", "uploads", "bitacoras-diarias");
const TIPOS_ARCHIVO_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext || ".bin";
    cb(null, `bitacora-diaria-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

export const uploadBitacoraDiaria = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!TIPOS_ARCHIVO_PERMITIDOS.includes(String(file.mimetype || ""))) {
      cb(new Error("Formato de archivo no permitido"));
      return;
    }
    cb(null, true);
  }
});

const rolActual = (req) => String(req.user?.rol || "").toUpperCase();
const esAdmin = (req) => rolActual(req) === "ADMIN";
const esSupervision = (req) => ["SUPERVISION", "SUPERVISOR"].includes(rolActual(req));
const esOperadorPlanta = (req) => ["OPERADOR_PLANTA", "OPERADOR"].includes(rolActual(req));
const puedeEntrar = (req) => esAdmin(req) || esSupervision(req) || esOperadorPlanta(req);

const userId = (req) => String(req.user?.uid || req.user?.id || req.user?._id || req.user?.sub || "");

const resolverUserId = async (req) => {
  const directId = userId(req);
  if (/^[a-f\d]{24}$/i.test(directId)) return directId;

  const email = String(req.user?.email || req.user?.username || "").trim().toLowerCase();
  if (!email) return "";

  const user = await User.findOne({ $or: [{ email }, { username: email }] }).select("_id");
  return user?._id?.toString() || "";
};

const parseDate = (value, fallback = null) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const normalizeEnum = (value, allowed, fallback) => {
  const clean = String(value || fallback).trim().toUpperCase();
  return allowed.includes(clean) ? clean : fallback;
};

const cleanText = (value) => String(value || "").trim();

const buildNovedad = async (req, body = {}) => ({
  hora: cleanText(body.hora),
  texto: cleanText(body.texto),
  tipo: normalizeEnum(body.tipo, TIPOS_NOVEDAD, "NORMAL"),
  evidenciasFotos: Array.isArray(body.evidenciasFotos) ? body.evidenciasFotos : [],
  creadoPor: await resolverUserId(req),
  fechaRegistro: new Date()
});

const canRead = (req, bitacora) => {
  if (esAdmin(req) || esSupervision(req)) return true;
  if (esOperadorPlanta(req)) return String(bitacora.creadoPor?._id || bitacora.creadoPor) === userId(req);
  return false;
};

const canEditOwnOpen = async (req, bitacora) => {
  if (esAdmin(req)) return true;
  if (!esOperadorPlanta(req) || bitacora.estado !== "ABIERTA") return false;
  const autor = await resolverUserId(req);
  return String(bitacora.creadoPor?._id || bitacora.creadoPor) === String(autor);
};

const getBitacoraOr404 = async (req, res) => {
  const bitacora = await BitacoraDiariaPC1.findById(req.params.id)
    .populate("creadoPor", "nombre email rol")
    .populate("cerradoPor", "nombre email rol")
    .populate("novedades.creadoPor", "nombre email rol");

  if (!bitacora || bitacora.eliminado) {
    res.status(404).json({ message: "Bitacora diaria no encontrada" });
    return null;
  }

  if (!canRead(req, bitacora)) {
    res.status(403).json({ message: "No autorizado para esta bitacora diaria" });
    return null;
  }

  return bitacora;
};

const crearMetadataArchivo = async (req, file) => ({
  nombre: file.filename,
  ruta: `/uploads/bitacoras-diarias/${file.filename}`,
  tipo: file.mimetype || "",
  fecha: new Date(),
  subidoPor: await resolverUserId(req)
});

export const crearBitacoraDiaria = async (req, res) => {
  try {
    if (!(esAdmin(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado para crear bitacoras diarias" });
    }

    const autor = await resolverUserId(req);
    if (!autor) return res.status(401).json({ message: "Sesion invalida. Vuelve a iniciar sesion." });

    const fecha = parseDate(req.body.fecha);
    const area = normalizeEnum(req.body.area, AREAS_PC1, "");
    const turno = normalizeEnum(req.body.turno, TURNOS, "");
    const turnoNumero = cleanText(req.body.turnoNumero);
    const operador = cleanText(req.body.operador || req.user?.nombre);

    if (!fecha || !area || !turno || !turnoNumero || !operador) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    const novedades = [];
    const textoInicial = cleanText(req.body.observacionInicial || req.body.texto);
    if (textoInicial) {
      novedades.push(await buildNovedad(req, {
        hora: cleanText(req.body.horaInicial) || new Date().toTimeString().slice(0, 5),
        texto: textoInicial,
        tipo: req.body.tipoInicial || "NORMAL",
        evidenciasFotos: Array.isArray(req.body.evidenciasFotos) ? req.body.evidenciasFotos : []
      }));
    }

    const bitacora = await BitacoraDiariaPC1.create({
      planta: "PC1",
      area,
      fecha,
      turno,
      turnoNumero,
      operador,
      operadorId: autor,
      supervisor: cleanText(req.body.supervisor),
      estado: "ABIERTA",
      novedades,
      archivosAdjuntos: Array.isArray(req.body.archivosAdjuntos) ? req.body.archivosAdjuntos : [],
      creadoPor: autor,
      fechaCreacion: new Date()
    });

    return res.status(201).json({ message: "Bitacora diaria creada", bitacora });
  } catch (error) {
    console.error("Error creando bitacora diaria:", error);
    return res.status(500).json({ message: "Error creando bitacora diaria", detail: error?.message });
  }
};

export const listarBitacorasDiarias = async (req, res) => {
  try {
    if (!puedeEntrar(req)) return res.status(403).json({ message: "No autorizado" });

    const { fecha = "", area = "", turno = "", estado = "", operador = "", desde = "", hasta = "" } = req.query;
    const filter = { eliminado: { $ne: true } };

    if (esOperadorPlanta(req) && !esAdmin(req)) {
      const autor = await resolverUserId(req);
      if (!autor) return res.status(401).json({ message: "Sesion invalida. Vuelve a iniciar sesion." });
      filter.creadoPor = autor;
    }

    if (fecha) {
      const inicio = parseDate(fecha);
      if (inicio) {
        const fin = new Date(inicio);
        inicio.setHours(0, 0, 0, 0);
        fin.setHours(23, 59, 59, 999);
        filter.fecha = { $gte: inicio, $lte: fin };
      }
    } else if (desde || hasta) {
      filter.fecha = {};
      if (desde) filter.fecha.$gte = parseDate(desde);
      if (hasta) {
        const fin = parseDate(hasta);
        if (fin) fin.setHours(23, 59, 59, 999);
        filter.fecha.$lte = fin;
      }
    }

    if (area) {
      const areaUp = String(area).toUpperCase();
      if (!AREAS_PC1.includes(areaUp)) return res.status(400).json({ message: "Area invalida" });
      filter.area = areaUp;
    }

    if (turno) {
      const turnoUp = String(turno).toUpperCase();
      if (!TURNOS.includes(turnoUp)) return res.status(400).json({ message: "Turno invalido" });
      filter.turno = turnoUp;
    }

    if (estado) {
      const estadoUp = String(estado).toUpperCase();
      if (!ESTADOS_BITACORA_DIARIA.includes(estadoUp)) return res.status(400).json({ message: "Estado invalido" });
      filter.estado = estadoUp;
    }

    if (operador) filter.operador = { $regex: String(operador), $options: "i" };

    const bitacoras = await BitacoraDiariaPC1.find(filter)
      .sort({ fecha: -1, fechaCreacion: -1 })
      .populate("creadoPor", "nombre email rol")
      .populate("cerradoPor", "nombre email rol");

    return res.json(bitacoras);
  } catch (error) {
    return res.status(500).json({ message: "Error listando bitacoras diarias" });
  }
};

export const obtenerBitacoraDiaria = async (req, res) => {
  try {
    const bitacora = await getBitacoraOr404(req, res);
    if (!bitacora) return;
    return res.json(bitacora);
  } catch (error) {
    return res.status(500).json({ message: "Error obteniendo bitacora diaria" });
  }
};

export const actualizarBitacoraDiaria = async (req, res) => {
  try {
    const bitacora = await getBitacoraOr404(req, res);
    if (!bitacora) return;

    if (!(await canEditOwnOpen(req, bitacora))) {
      return res.status(403).json({ message: "Solo puedes editar bitacoras abiertas propias" });
    }

    if (req.body.area) bitacora.area = normalizeEnum(req.body.area, AREAS_PC1, bitacora.area);
    if (req.body.fecha) bitacora.fecha = parseDate(req.body.fecha, bitacora.fecha);
    if (req.body.turno) bitacora.turno = normalizeEnum(req.body.turno, TURNOS, bitacora.turno);
    if (req.body.turnoNumero !== undefined) bitacora.turnoNumero = cleanText(req.body.turnoNumero);
    if (req.body.operador !== undefined) bitacora.operador = cleanText(req.body.operador);
    if (req.body.supervisor !== undefined) bitacora.supervisor = cleanText(req.body.supervisor);
    if (Array.isArray(req.body.archivosAdjuntos)) bitacora.archivosAdjuntos = req.body.archivosAdjuntos;

    await bitacora.save();
    return res.json({ message: "Bitacora diaria actualizada", bitacora });
  } catch (error) {
    return res.status(500).json({ message: "Error actualizando bitacora diaria" });
  }
};

export const agregarNovedad = async (req, res) => {
  try {
    const bitacora = await getBitacoraOr404(req, res);
    if (!bitacora) return;

    if (!(await canEditOwnOpen(req, bitacora))) {
      return res.status(403).json({ message: "No autorizado para agregar novedades" });
    }

    if (bitacora.estado !== "ABIERTA") {
      return res.status(400).json({ message: "No se pueden agregar novedades a una bitacora cerrada" });
    }

    const novedad = await buildNovedad(req, req.body);
    if (!novedad.hora || !novedad.texto) {
      return res.status(400).json({ message: "Hora y texto son obligatorios" });
    }

    bitacora.novedades.push(novedad);
    await bitacora.save();
    return res.status(201).json({ message: "Novedad agregada", bitacora });
  } catch (error) {
    return res.status(500).json({ message: "Error agregando novedad" });
  }
};

export const actualizarNovedad = async (req, res) => {
  try {
    const bitacora = await getBitacoraOr404(req, res);
    if (!bitacora) return;

    if (!(await canEditOwnOpen(req, bitacora))) {
      return res.status(403).json({ message: "No autorizado para editar novedades" });
    }

    const novedad = bitacora.novedades.id(req.params.novedadId);
    if (!novedad) return res.status(404).json({ message: "Novedad no encontrada" });

    if (req.body.hora !== undefined) novedad.hora = cleanText(req.body.hora);
    if (req.body.texto !== undefined) novedad.texto = cleanText(req.body.texto);
    if (req.body.tipo !== undefined) novedad.tipo = normalizeEnum(req.body.tipo, TIPOS_NOVEDAD, novedad.tipo);
    if (Array.isArray(req.body.evidenciasFotos)) novedad.evidenciasFotos = req.body.evidenciasFotos;

    await bitacora.save();
    return res.json({ message: "Novedad actualizada", bitacora });
  } catch (error) {
    return res.status(500).json({ message: "Error actualizando novedad" });
  }
};

export const eliminarNovedad = async (req, res) => {
  try {
    const bitacora = await getBitacoraOr404(req, res);
    if (!bitacora) return;

    if (!(await canEditOwnOpen(req, bitacora))) {
      return res.status(403).json({ message: "No autorizado para eliminar novedades" });
    }

    const novedad = bitacora.novedades.id(req.params.novedadId);
    if (!novedad) return res.status(404).json({ message: "Novedad no encontrada" });

    novedad.deleteOne();
    await bitacora.save();
    return res.json({ message: "Novedad eliminada", bitacora });
  } catch (error) {
    return res.status(500).json({ message: "Error eliminando novedad" });
  }
};

export const cerrarBitacoraDiaria = async (req, res) => {
  try {
    const bitacora = await getBitacoraOr404(req, res);
    if (!bitacora) return;

    if (!(await canEditOwnOpen(req, bitacora))) {
      return res.status(403).json({ message: "No autorizado para cerrar bitacora" });
    }

    if (bitacora.estado === "CERRADA") {
      return res.status(400).json({ message: "La bitacora ya esta cerrada" });
    }

    const autor = await resolverUserId(req);
    bitacora.estado = "CERRADA";
    bitacora.fechaCierre = new Date();
    bitacora.cerradoPor = autor || null;
    await bitacora.save();
    return res.json({ message: "Bitacora diaria cerrada", bitacora });
  } catch (error) {
    return res.status(500).json({ message: "Error cerrando bitacora diaria" });
  }
};

export const eliminarBitacoraDiaria = async (req, res) => {
  try {
    if (!esAdmin(req)) return res.status(403).json({ message: "Solo ADMIN puede eliminar bitacoras diarias" });

    const bitacora = await BitacoraDiariaPC1.findByIdAndUpdate(
      req.params.id,
      { eliminado: true, activo: false, fechaActualizacion: new Date() },
      { new: true }
    );

    if (!bitacora) return res.status(404).json({ message: "Bitacora diaria no encontrada" });
    return res.json({ message: "Bitacora diaria eliminada", bitacora });
  } catch (error) {
    return res.status(500).json({ message: "Error eliminando bitacora diaria" });
  }
};

export const subirArchivoBitacoraDiaria = async (req, res) => {
  try {
    if (!(esAdmin(req) || esOperadorPlanta(req))) {
      return res.status(403).json({ message: "No autorizado para subir evidencias" });
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ message: "Archivo requerido" });

    const archivos = [];
    for (const file of files) {
      archivos.push(await crearMetadataArchivo(req, file));
    }

    return res.status(201).json({ message: "Archivo cargado", archivos, archivo: archivos[0] });
  } catch (error) {
    return res.status(500).json({ message: "Error subiendo evidencia" });
  }
};

const formatDate = (value, withTime = false) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return withTime ? date.toLocaleString("es-CL") : date.toLocaleDateString("es-CL");
};

const areaLabel = (area) => ({
  PLANTA_ANTIGUA: "Planta Antigua",
  PLANTA_AMPLIADA: "Planta Ampliada",
  CENTRIFUGA: "Centrifuga"
}[area] || area || "-");

const drawLogo = (doc, x, y, width) => {
  try {
    const logoPath = path.join(process.cwd(), "src", "assets", "logo-novandino5.png");
    if (fs.existsSync(logoPath)) doc.image(logoPath, x, y, { width });
  } catch {}
};

const ensurePdfSpace = (doc, y, needed = 100) => {
  if (y + needed <= 785) return y;
  doc.addPage();
  return 45;
};

export const descargarBitacoraDiariaPdf = async (req, res) => {
  try {
    const bitacora = await getBitacoraOr404(req, res);
    if (!bitacora) return;

    const doc = new PDFDocument({ size: "A4", margin: 35 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=bitacora-diaria-${bitacora.turnoNumero || bitacora._id}.pdf`);
    doc.pipe(res);

    drawLogo(doc, 35, 24, 120);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(19).text("BITACORA DIARIA PC1", 170, 34);
    doc.fillColor("#64748B").font("Helvetica").fontSize(9).text("Superintendencia Operaciones Litio - Libro de actas digital", 172, 59);
    doc.rect(35, 88, 525, 5).fill("#461D77");

    let y = 112;
    const datos = [
      ["Fecha", formatDate(bitacora.fecha)],
      ["Area", areaLabel(bitacora.area)],
      ["Turno", bitacora.turno],
      ["N turno", bitacora.turnoNumero],
      ["Operador", bitacora.operador],
      ["Supervisor", bitacora.supervisor || "-"],
      ["Estado", bitacora.estado],
      ["Fecha cierre", formatDate(bitacora.fechaCierre, true)]
    ];

    datos.forEach((item, index) => {
      const x = index % 2 === 0 ? 35 : 300;
      if (index % 2 === 0 && index !== 0) y += 28;
      doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(7).text(item[0], x, y);
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text(item[1] || "-", x, y + 10, { width: 230 });
    });

    y += 46;
    doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(11).text("NOVEDADES DEL TURNO", 35, y);
    y += 18;

    const novedades = [...(bitacora.novedades || [])].sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
    if (!novedades.length) {
      doc.fillColor("#64748B").font("Helvetica").fontSize(9).text("Sin novedades registradas", 35, y);
      y += 26;
    }

    for (const novedad of novedades) {
      y = ensurePdfSpace(doc, y, 70);
      doc.rect(35, y, 525, 54).fillAndStroke("#F8FAFC", "#D7D8E8");
      doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(8).text(`${novedad.hora} - ${novedad.tipo}`, 45, y + 8);
      doc.fillColor("#64748B").font("Helvetica").fontSize(7)
        .text(`Registrado: ${formatDate(novedad.fechaRegistro, true)} | Usuario: ${novedad.creadoPor?.nombre || "-"}`, 45, y + 20);
      doc.fillColor("#111827").font("Helvetica").fontSize(8).text(novedad.texto || "-", 45, y + 32, { width: 500 });
      y += 66;
    }

    y = ensurePdfSpace(doc, y, 130);
    doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(11).text("ARCHIVOS ADJUNTOS", 35, y);
    y += 18;
    const archivos = bitacora.archivosAdjuntos || [];
    if (!archivos.length) {
      doc.fillColor("#64748B").font("Helvetica").fontSize(8).text("Sin archivos adjuntos generales", 35, y);
      y += 22;
    } else {
      archivos.forEach((archivo) => {
        y = ensurePdfSpace(doc, y, 18);
        doc.fillColor("#111827").font("Helvetica").fontSize(8).text(`- ${archivo.nombre} (${archivo.tipo || "archivo"})`, 45, y);
        y += 14;
      });
    }

    y = ensurePdfSpace(doc, y, 220);
    doc.fillColor("#461D77").font("Helvetica-Bold").fontSize(11).text("EVIDENCIAS FOTOGRAFICAS", 35, y);
    y += 18;

    let tieneFotos = false;
    for (const novedad of novedades) {
      const fotos = (novedad.evidenciasFotos || []).filter(f => String(f.tipo || "").startsWith("image/"));
      for (const foto of fotos) {
        tieneFotos = true;
        y = ensurePdfSpace(doc, y, 130);
        const imgPath = path.join(process.cwd(), "src", String(foto.ruta || "").replace(/^\/uploads\//, "uploads/"));
        doc.fillColor("#111827").font("Helvetica-Bold").fontSize(8).text(`${novedad.hora} - ${novedad.tipo}`, 35, y);
        doc.fillColor("#64748B").font("Helvetica").fontSize(7).text(novedad.texto || "-", 35, y + 12, { width: 250 });
        if (fs.existsSync(imgPath)) {
          try {
            doc.image(imgPath, 330, y, { fit: [190, 110] });
            doc.rect(330, y, 190, 110).stroke("#D7D8E8");
          } catch {
            doc.rect(330, y, 190, 110).stroke("#D7D8E8");
          }
        } else {
          doc.rect(330, y, 190, 110).stroke("#D7D8E8");
          doc.text(foto.nombre || "Foto", 340, y + 48, { width: 170, align: "center" });
        }
        y += 126;
      }
    }

    if (!tieneFotos) {
      doc.fillColor("#64748B").font("Helvetica").fontSize(8).text("Sin evidencias fotograficas", 35, y);
    }

    doc.end();
  } catch (error) {
    console.error("Error PDF bitacora diaria:", error);
    return res.status(500).json({ message: "Error generando PDF bitacora diaria" });
  }
};
