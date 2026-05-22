import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import RegistroDatos, { HORARIOS_TURNO, VARIABLES_REGISTRO_DATOS } from "../models/RegistroDatos.js";

const TURNOS_VALIDOS = Object.keys(HORARIOS_TURNO);

const toFechaKey = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const buildFechaHora = (fecha, hora, turno) => {
  const [hh, mm] = String(hora || "").split(":").map(Number);
  const base = new Date(`${toFechaKey(fecha)}T00:00:00.000Z`);
  base.setUTCHours(hh || 0, mm || 0, 0, 0);

  if (turno === "TURNO_B" && [1, 5].includes(hh)) {
    base.setUTCDate(base.getUTCDate() + 1);
  }

  return base;
};

const rolActual = (req) => String(req.user?.rol || "").toUpperCase();
const puedeOperarRegistroDatos = (req) => ["ADMIN", "OPERADOR_PLANTA"].includes(rolActual(req));

const normalizeLecturas = (lecturas = []) => {
  const input = new Map(
    (Array.isArray(lecturas) ? lecturas : [])
      .map((item) => [String(item?.nombre || "").trim(), item])
      .filter(([nombre]) => VARIABLES_REGISTRO_DATOS.includes(nombre))
  );

  return VARIABLES_REGISTRO_DATOS.map((nombre) => {
    const item = input.get(nombre) || {};
    const valor = Number(item.valor);
    return {
      nombre,
      valor: Number.isFinite(valor) && valor >= 0 ? Math.trunc(valor) : null,
      observacion: String(item.observacion || "").trim()
    };
  });
};

const calcularDiferencias = async ({ fechaHora, lecturas }) => {
  const previousRecords = await RegistroDatos.find({
    eliminado: { $ne: true },
    fechaHora: { $lt: fechaHora }
  })
    .select("fechaHora lecturas.nombre lecturas.valor")
    .sort({ fechaHora: -1 })
    .limit(80)
    .lean();

  const anteriores = new Map();
  for (const registro of previousRecords) {
    for (const lectura of registro.lecturas || []) {
      if (!anteriores.has(lectura.nombre)) {
        anteriores.set(lectura.nombre, Number(lectura.valor));
      }
    }
  }

  return lecturas.map((lectura) => {
    const valorAnterior = anteriores.has(lectura.nombre) ? anteriores.get(lectura.nombre) : null;
    const diferencia = valorAnterior === null ? 0 : lectura.valor - valorAnterior;
    return {
      ...lectura,
      diferencia,
      valorAnterior,
      alertaPreparada: {
        activa: Math.abs(diferencia) > 100000,
        tipo: Math.abs(diferencia) > 100000 ? "VARIACION_ANORMAL_PREPARADA" : "",
        mensaje: Math.abs(diferencia) > 100000 ? "Estructura preparada para alerta por variacion anormal." : ""
      }
    };
  });
};

const buildFilter = (query = {}) => {
  const filter = { eliminado: { $ne: true } };
  const { desde, hasta, turno, operador } = query;

  if (turno && TURNOS_VALIDOS.includes(String(turno).toUpperCase())) {
    filter.turno = String(turno).toUpperCase();
  }

  if (operador) {
    filter.operador = { $regex: String(operador), $options: "i" };
  }

  if (desde || hasta) {
    filter.fechaHora = {};
    if (desde) filter.fechaHora.$gte = new Date(`${desde}T00:00:00.000Z`);
    if (hasta) filter.fechaHora.$lte = new Date(`${hasta}T23:59:59.999Z`);
  }

  return filter;
};

const registroSelect = "planta fecha fechaKey fechaHora turno hora operador lecturas.nombre lecturas.valor lecturas.diferencia lecturas.valorAnterior lecturas.observacion observacionesGenerales origen estado createdAt updatedAt";

export const crearRegistroDatos = async (req, res) => {
  const inicio = Date.now();
  console.time("⚡ Tiempo crear registro datos");

  try {
    if (!puedeOperarRegistroDatos(req)) {
      return res.status(403).json({ message: "No autorizado para crear registro de datos" });
    }

    const fechaKey = toFechaKey(req.body.fecha || new Date());
    const turno = String(req.body.turno || "").toUpperCase();
    const hora = String(req.body.hora || "").trim();

    if (!TURNOS_VALIDOS.includes(turno)) {
      return res.status(400).json({ message: "Turno invalido" });
    }

    if (!HORARIOS_TURNO[turno].includes(hora)) {
      return res.status(400).json({ message: "Horario no corresponde al turno seleccionado" });
    }

    const yaExiste = await RegistroDatos.exists({ fechaKey, turno, hora, eliminado: { $ne: true } });
    if (yaExiste) {
      return res.status(409).json({ message: "Ya existe un registro para este turno y horario" });
    }

    const lecturasBase = normalizeLecturas(req.body.lecturas);
    const faltantes = lecturasBase.filter((item) => item.valor === null).map((item) => item.nombre);
    if (faltantes.length) {
      return res.status(400).json({ message: "Faltan valores totalizadores", faltantes });
    }

    const fechaHora = buildFechaHora(fechaKey, hora, turno);
    const lecturas = await calcularDiferencias({ fechaHora, lecturas: lecturasBase });
    const estado = lecturas.some((item) => item.alertaPreparada?.activa) ? "OBSERVADO" : "REGISTRADO";
    const evidenciasOcr = Array.isArray(req.body.evidenciasOcr) ? req.body.evidenciasOcr.slice(0, 18) : [];

    const registro = await RegistroDatos.create({
      planta: "PAM_AMPLIADA",
      fecha: new Date(`${fechaKey}T00:00:00.000Z`),
      fechaKey,
      fechaHora,
      turno,
      hora,
      operador: req.user?.nombre || req.body.operador || "Operador",
      operadorId: req.user?.uid || null,
      lecturas,
      evidenciasOcr,
      observacionesGenerales: String(req.body.observacionesGenerales || "").trim(),
      origen: evidenciasOcr.length ? "MIXTO" : "MANUAL",
      estado
    });

    console.log("📊 REGISTRO DATOS CREADO", {
      id: registro._id,
      fechaKey,
      turno,
      hora,
      operador: registro.operador
    });

    return res.status(201).json({
      message: "Registro de datos creado",
      registro: {
        id: registro._id,
        fechaKey: registro.fechaKey,
        turno: registro.turno,
        hora: registro.hora,
        estado: registro.estado
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Ya existe un registro para este turno y horario" });
    }
    console.error("Error creando registro datos:", error);
    return res.status(500).json({ message: "Error creando registro de datos" });
  } finally {
    console.timeEnd("⚡ Tiempo crear registro datos");
    console.log("⚡ Tiempo registro datos total:", `${Date.now() - inicio}ms`);
  }
};

export const listarRegistroDatos = async (req, res) => {
  try {
    const registros = await RegistroDatos.find(buildFilter(req.query))
      .select(registroSelect)
      .sort({ fechaHora: -1 })
      .limit(250)
      .lean();

    return res.json(registros);
  } catch (error) {
    console.error("Error listando registro datos:", error);
    return res.status(500).json({ message: "Error listando registros de datos" });
  }
};

export const obtenerRegistroDatos = async (req, res) => {
  try {
    const registro = await RegistroDatos.findOne({ _id: req.params.id, eliminado: { $ne: true } })
      .select(`${registroSelect} evidenciasOcr`)
      .lean();

    if (!registro) return res.status(404).json({ message: "Registro no encontrado" });
    return res.json(registro);
  } catch (error) {
    console.error("Error obteniendo registro datos:", error);
    return res.status(500).json({ message: "Error obteniendo registro de datos" });
  }
};

export const obtenerRegistroDatosRealtime = async (req, res) => {
  try {
    const registros = await RegistroDatos.find({ eliminado: { $ne: true } })
      .select(registroSelect)
      .sort({ fechaHora: -1 })
      .limit(20)
      .lean();

    return res.json({
      actualizadoEn: new Date(),
      registros
    });
  } catch (error) {
    console.error("Error realtime registro datos:", error);
    return res.status(500).json({ message: "Error obteniendo realtime de registro de datos" });
  }
};

export const obtenerDashboardRegistroDatos = async (req, res) => {
  const inicio = Date.now();
  try {
    const now = new Date();
    const desde = new Date(now);
    desde.setDate(desde.getDate() - 6);
    desde.setHours(0, 0, 0, 0);

    const mongoInicio = Date.now();
    const [ultimos, porDia, totalHoy] = await Promise.all([
      RegistroDatos.find({ eliminado: { $ne: true } })
        .select(registroSelect)
        .sort({ fechaHora: -1 })
        .limit(12)
        .lean(),
      RegistroDatos.aggregate([
        { $match: { eliminado: { $ne: true }, fechaHora: { $gte: desde } } },
        { $group: { _id: "$fechaKey", total: { $sum: 1 }, observado: { $sum: { $cond: [{ $eq: ["$estado", "OBSERVADO"] }, 1, 0] } } } },
        { $sort: { _id: 1 } }
      ]),
      RegistroDatos.countDocuments({ eliminado: { $ne: true }, fechaKey: toFechaKey(now) })
    ]);

    console.log("⚡ Tiempo Mongo dashboard registro datos:", `${Date.now() - mongoInicio}ms`);

    const variaciones = ultimos
      .flatMap((registro) => (registro.lecturas || []).map((lectura) => ({
        variable: lectura.nombre,
        diferencia: lectura.diferencia || 0,
        valor: lectura.valor || 0,
        fechaHora: registro.fechaHora,
        hora: registro.hora,
        turno: registro.turno
      })))
      .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
      .slice(0, 8);

    console.log("📈 DASHBOARD ACTUALIZADO");
    return res.json({
      totalHoy,
      ultimosRegistros: ultimos,
      registrosPorDia: porDia.map((item) => ({ fecha: item._id, total: item.total, observado: item.observado })),
      principalesVariaciones: variaciones,
      variables: VARIABLES_REGISTRO_DATOS,
      horarios: HORARIOS_TURNO,
      actualizadoEn: new Date()
    });
  } catch (error) {
    console.error("Error dashboard registro datos:", error);
    return res.status(500).json({ message: "Error obteniendo dashboard registro datos" });
  } finally {
    console.log("⚡ Tiempo dashboard registro datos:", `${Date.now() - inicio}ms`);
  }
};

export const exportarRegistroDatosPdf = async (req, res) => {
  try {
    const registros = await RegistroDatos.find(buildFilter(req.query)).select(registroSelect).sort({ fechaHora: -1 }).limit(250).lean();
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=registro-datos-pam.pdf");
    doc.pipe(res);

    doc.fontSize(16).fillColor("#111827").text("REGISTRO DE DATOS PAM AMPLIADA", { align: "center" });
    doc.moveDown(0.6).fontSize(9).fillColor("#374151").text(`Generado: ${new Date().toLocaleString("es-CL")}`);
    doc.moveDown();

    registros.forEach((registro, index) => {
      if (index > 0) doc.moveDown(0.6);
      doc.fontSize(10).fillColor("#4c1d95").text(`${registro.fechaKey} ${registro.hora} - ${registro.turno} - ${registro.operador}`);
      const resumen = (registro.lecturas || []).map((l) => `${l.nombre}: ${l.valor} (${l.diferencia >= 0 ? "+" : ""}${l.diferencia})`).join(" | ");
      doc.fontSize(7).fillColor("#111827").text(resumen, { columns: 2, columnGap: 18 });
    });

    doc.end();
  } catch (error) {
    console.error("Error PDF registro datos:", error);
    res.status(500).json({ message: "Error generando PDF" });
  }
};

export const exportarRegistroDatosExcel = async (req, res) => {
  try {
    const registros = await RegistroDatos.find(buildFilter(req.query)).select(registroSelect).sort({ fechaHora: -1 }).limit(500).lean();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Registro Datos PAM");
    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Hora", key: "hora", width: 10 },
      { header: "Turno", key: "turno", width: 12 },
      { header: "Operador", key: "operador", width: 24 },
      { header: "Variable", key: "variable", width: 28 },
      { header: "Valor", key: "valor", width: 14 },
      { header: "Diferencia", key: "diferencia", width: 14 },
      { header: "Observacion", key: "observacion", width: 32 }
    ];

    registros.forEach((registro) => {
      (registro.lecturas || []).forEach((lectura) => {
        sheet.addRow({
          fecha: registro.fechaKey,
          hora: registro.hora,
          turno: registro.turno,
          operador: registro.operador,
          variable: lectura.nombre,
          valor: lectura.valor,
          diferencia: lectura.diferencia,
          observacion: lectura.observacion || ""
        });
      });
    });

    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4C1D95" } };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=registro-datos-pam.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error Excel registro datos:", error);
    res.status(500).json({ message: "Error generando Excel" });
  }
};
