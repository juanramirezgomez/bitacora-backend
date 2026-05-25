import Bitacora from "../models/Bitacora.js";
import RegistroOperacion from "../models/RegistroOperacion.js";
import CierreTurno from "../models/CierreTurno.js";

const puedeOperarCaldera = (rol) =>
  ["ADMIN", "OPERADOR", "OPERADOR_CALDERA"].includes(String(rol || "").toUpperCase());

const esOperadorCaldera = (rol) =>
  ["OPERADOR", "OPERADOR_CALDERA"].includes(String(rol || "").toUpperCase());

const puedeVerTendenciasCaldera = (rol) =>
  ["ADMIN", "SUPERVISION", "SUPERVISOR", "OPERADOR", "OPERADOR_CALDERA"].includes(String(rol || "").toUpperCase());

const ordenDia = [
  "07:00","08:00","09:00","10:00","11:00","12:00",
  "13:00","14:00","15:00","16:00","17:00","18:00"
];

const ordenNoche = [
  "19:00","20:00","21:00","22:00","23:00",
  "00:00","01:00","02:00","03:00","04:00","05:00","06:00"
];

const ordenarPorTurno = (registros, turno) => {
  const orden = String(turno || "").toUpperCase() === "DIA" ? ordenDia : ordenNoche;
  return [...registros].sort((a, b) => {
    const ia = orden.indexOf(a.hora);
    const ib = orden.indexOf(b.hora);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const CHILE_TZ = "America/Santiago";

const getTimeZoneOffsetMinutes = (date, timeZone = CHILE_TZ) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value || "GMT-4";
  const match = value.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return -240;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
};

const chileDateTimeToUtc = (year, month, day, hour = 0, minute = 0, second = 0, ms = 0) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - offsetMinutes * 60000);
};

const chileDateParts = (value) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
};

const parseDateOnly = (value, fallback, endOfDay = false) => {
  if (!value) return new Date(fallback);
  const clean = String(value).trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? chileDateTimeToUtc(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      )
    : new Date(clean);

  if (Number.isNaN(date.getTime())) return new Date(fallback);
  return date;
};

const normalizeLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

const fechaHoraOperacional = (fechaInicio, hora, turno) => {
  const [hh = "0", mm = "0"] = String(hora || "00:00").split(":");
  const h = Number(hh);
  const m = Number(mm);
  const parts = chileDateParts(fechaInicio);
  const base = chileDateTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    Number.isFinite(h) ? h : 0,
    Number.isFinite(m) ? m : 0
  );

  if (String(turno || "").toUpperCase() === "NOCHE" && h >= 0 && h <= 6) {
    base.setTime(base.getTime() + 24 * 60 * 60 * 1000);
  }

  return base;
};

/* =====================================================
   INICIAR TURNO
===================================================== */
export const iniciarTurno = async (req, res) => {
  try {

    let { turno, turnoNumero, fechaInicio } = req.body || {};
    let { nombre, rol } = req.user;

    nombre = String(nombre).trim();

    /* ================= VALIDACIONES ================= */

    if (!puedeOperarCaldera(rol)) {
      return res.status(403).json({
        message: "Solo OPERADOR_CALDERA puede iniciar turno"
      });
    }

    if (!turno || !turnoNumero) {
      return res.status(400).json({
        message: "turno y turnoNumero son obligatorios"
      });
    }

    turno = String(turno).trim().toUpperCase();
    turnoNumero = String(turnoNumero).trim();

    // 🔥 VALIDACIÓN FUERTE (ANTI BUG DIAMETRO)
    if (!["DIA", "NOCHE"].includes(turno)) {
      console.warn("⚠️ Turno inválido detectado:", turno);
      return res.status(400).json({
        message: "Turno inválido (solo DIA o NOCHE)"
      });
    }

    if (!["39", "44"].includes(turnoNumero)) {
      return res.status(400).json({
        message: "Turno número inválido"
      });
    }

    /* ================= BITÁCORA ABIERTA ================= */

    const existeAbierta = await Bitacora.findOne({
      operador: new RegExp(`^\\s*${nombre}\\s*$`, "i"),
      estado: "ABIERTA"
    });

    if (existeAbierta) {
      return res.status(409).json({
        message: "Ya tienes una bitácora abierta",
        bitacora: existeAbierta
      });
    }

    /* ================= FECHA ================= */

    let fechaFinal;

    if (fechaInicio) {

      const partes = fechaInicio.split("-");

      if (partes.length !== 3) {
        return res.status(400).json({ message: "Formato de fecha inválido" });
      }

      const year = parseInt(partes[0]);
      const month = parseInt(partes[1]) - 1;
      const day = parseInt(partes[2]);

      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return res.status(400).json({ message: "Fecha inválida" });
      }

      fechaFinal = new Date(year, month, day, 12, 0, 0);

    } else {

      const hoy = new Date();
      fechaFinal = new Date(
        hoy.getFullYear(),
        hoy.getMonth(),
        hoy.getDate(),
        12, 0, 0
      );
    }

    /* ================= CREAR ================= */

    const nuevaBitacora = await Bitacora.create({
      operador: nombre,
      turno,
      turnoNumero,
      estado: "ABIERTA",
      fechaInicio: fechaFinal
    });

    return res.status(201).json({
      message: "Turno iniciado correctamente",
      bitacora: nuevaBitacora
    });

  } catch (error) {
    console.error("🔥 Error iniciarTurno:", error);
    return res.status(500).json({
      message: "Error al iniciar turno"
    });
  }
};


/* =====================================================
   BITÁCORA ABIERTA
===================================================== */
export const obtenerBitacoraAbierta = async (req, res) => {
  try {

    let { nombre, rol } = req.user;
    nombre = String(nombre).trim();

    if (!puedeOperarCaldera(rol)) {
      return res.status(403).json({
        message: "Solo OPERADOR_CALDERA puede consultar"
      });
    }

    const abierta = await Bitacora.findOne({
      operador: new RegExp(`^\\s*${nombre}\\s*$`, "i"),
      estado: "ABIERTA",
      eliminado: { $ne: true }
    });

    return res.json({
      bitacora: abierta || null
    });

  } catch (error) {
    console.error("🔥 Error:", error);
    return res.status(500).json({
      message: "Error buscando bitácora"
    });
  }
};


/* =====================================================
   LISTAR BITÁCORAS (SANITIZA DATOS)
===================================================== */
export const listarBitacoras = async (req, res) => {

  try {

    let { rol, nombre } = req.user;

    const {
      estado,
      page = 1,
      limit = 5,
      search = '',
      fecha = ''
    } = req.query;

    nombre = String(nombre).trim();

    const filtro = {
      eliminado: { $ne: true }
    };

    /* =========================================
       FILTRO OPERADOR
    ========================================= */

    if (esOperadorCaldera(rol)) {

      filtro.operador =
        new RegExp(
          `^\\s*${nombre}\\s*$`,
          "i"
        );
    }

    /* =========================================
       ESTADO
    ========================================= */

    if (estado) {

      filtro.estado = estado;
    }

    /* =========================================
       BUSCADOR
    ========================================= */

    if (search) {

      filtro.$or = [

        {
          operador: {
            $regex: search,
            $options: 'i'
          }
        },

        {
          turnoNumero: {
            $regex: search,
            $options: 'i'
          }
        }
      ];
    }

    /* =========================================
       FECHA
    ========================================= */

    if (fecha) {

      const inicio =
        parseDateOnly(fecha, new Date());

      const fin =
        parseDateOnly(fecha, new Date(), true);

      filtro.fechaInicio = {

        $gte: inicio,

        $lte: fin
      };
    }

    /* =========================================
       PAGINACIÓN
    ========================================= */

    const pageNumber =
      parseInt(page) || 1;

    const limitNumber =
      parseInt(limit) || 5;

    const skip =
      (pageNumber - 1) * limitNumber;

    /* =========================================
       TOTAL
    ========================================= */

    const total =
      await Bitacora.countDocuments(filtro);

    const totalPages =
      Math.ceil(total / limitNumber);

    console.log({

      total,

      pageNumber,

      limitNumber,

      skip,

      totalPages
    });

    /* =========================================
       CONSULTA
    ========================================= */

    let bitacoras =
      await Bitacora.find(filtro)

        .sort({
          fechaInicio: -1
        })

        .skip(skip)

        .limit(limitNumber);

    /* =========================================
       SANITIZAR
    ========================================= */

    bitacoras =
      bitacoras.map(b => {

        const turnoValido =

          ["DIA", "NOCHE"]
            .includes(b.turno)

              ? b.turno

              : "NOCHE";

        return {

          ...b.toObject(),

          turno:
            turnoValido
        };
      });

    /* =========================================
       RESPONSE
    ========================================= */

    return res.json({

      bitacoras,

      total,

      currentPage:
        pageNumber,

      totalPages
    });

  } catch (error) {

    console.error(
      "🔥 Error listarBitacoras:",
      error
    );

    return res.status(500).json({

      message:
        "Error listando bitácoras"
    });
  }
};

/* =====================================================
   OBTENER POR ID
===================================================== */
export const obtenerBitacora = async (req, res) => {
  try {

    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findOne({
      _id: bitacoraId,
      eliminado: { $ne: true }
    });

    if (!bitacora) {
      return res.status(404).json({
        message: "Bitácora no encontrada"
      });
    }

    // 🔥 SANITIZAR
    if (!["DIA", "NOCHE"].includes(bitacora.turno)) {
      bitacora.turno = "NOCHE";
    }

    return res.json(bitacora);

  } catch (error) {
    console.error("🔥 Error:", error);
    return res.status(500).json({
      message: "Error obteniendo bitácora"
    });
  }
};


/* =====================================================
   ELIMINAR
===================================================== */
export const eliminarBitacora = async (req, res) => {
  try {

    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findOne({
      _id: bitacoraId,
      eliminado: { $ne: true }
    });

    if (!bitacora) {
      return res.status(404).json({
        message: "Bitácora no encontrada"
      });
    }

    if (bitacora.estado !== "CERRADA") {
      return res.status(400).json({
        message: "Solo se pueden eliminar cerradas"
      });
    }

    bitacora.eliminado = true;
    bitacora.fechaEliminacion = new Date();
    bitacora.eliminadoPor = req.user?._id || req.user?.id || null;
    await bitacora.save();

    console.log("✅ BITÁCORA OCULTADA SIN BORRAR REGISTROS", {
      bitacoraId,
      operador: bitacora.operador,
      turno: bitacora.turno,
      turnoNumero: bitacora.turnoNumero
    });

    res.json({
      message: "Bitácora ocultada correctamente. Los registros operacionales se conservaron.",
      bitacoraId
    });

  } catch (error) {
    console.error("Error eliminando:", error);
    res.status(500).json({
      message: "Error eliminando bitácora"
    });
  }
};

/* =====================================================
   TENDENCIAS OPERACIONALES
===================================================== */
export const obtenerTendenciasBitacora = async (req, res) => {
  try {
    const { bitacoraId } = req.params;
    const { rol, nombre } = req.user || {};

    if (!puedeVerTendenciasCaldera(rol)) {
      return res.status(403).json({ message: "No autorizado para ver tendencias" });
    }

    const bitacora = await Bitacora.findOne({
      _id: bitacoraId,
      eliminado: { $ne: true }
    });
    if (!bitacora) {
      return res.status(404).json({ message: "Bitacora no encontrada" });
    }

    if (esOperadorCaldera(rol)) {
      const mismoOperador = String(bitacora.operador || "").trim().toLowerCase() ===
        String(nombre || "").trim().toLowerCase();

      if (!mismoOperador) {
        return res.status(403).json({ message: "No autorizado para esta bitacora" });
      }
    }

    const registros = ordenarPorTurno(
      await RegistroOperacion.find({ bitacoraId }).lean(),
      bitacora.turno
    );

    const parametrosMap = new Map();

    registros.forEach((registro) => {
      (registro.parametros || []).forEach((parametro) => {
        const label = String(parametro.label || "").trim();
        if (!label) return;

        const value = toNumber(parametro.value);
        if (value === null) return;

        if (!parametrosMap.has(label)) {
          parametrosMap.set(label, {
            label,
            unidad: parametro.unidad || "",
            valores: []
          });
        }

        parametrosMap.get(label).valores.push({
          hora: registro.hora,
          value
        });
      });
    });

    const parametrosDisponibles = Array.from(parametrosMap.values()).map((item) => ({
      label: item.label,
      unidad: item.unidad
    }));

    const resumenParametros = Array.from(parametrosMap.values()).map((item) => {
      const values = item.valores.map(v => v.value);
      const total = values.reduce((acc, value) => acc + value, 0);

      return {
        label: item.label,
        unidad: item.unidad,
        min: Math.min(...values),
        max: Math.max(...values),
        promedio: values.length ? Number((total / values.length).toFixed(2)) : null,
        ultimo: values.length ? values[values.length - 1] : null
      };
    });

    return res.json({
      bitacora,
      registros,
      parametrosDisponibles,
      resumen: {
        operador: bitacora.operador,
        turno: bitacora.turno,
        turnoNumero: bitacora.turnoNumero,
        fecha: bitacora.fechaInicio,
        cantidadRegistros: registros.length,
        parametros: resumenParametros
      }
    });
  } catch (error) {
    console.error("Error tendencias bitacora:", error);
    return res.status(500).json({ message: "Error obteniendo tendencias operacionales" });
  }
};

/* =====================================================
   TENDENCIAS HISTORICAS OPERACIONALES
===================================================== */
export const obtenerTendenciasHistoricas = async (req, res) => {
  try {
    const { rol, nombre } = req.user || {};

    if (!puedeVerTendenciasCaldera(rol)) {
      return res.status(403).json({ message: "No autorizado para ver tendencias historicas" });
    }

    const {
      desde = "",
      hasta = "",
      turno = "",
      turnoNumero = "",
      operador = "",
      estado = "",
      parametro = ""
    } = req.query;

    const ahora = new Date();
    const inicioDefault = new Date();
    inicioDefault.setDate(ahora.getDate() - 7);
    inicioDefault.setHours(0, 0, 0, 0);

    const desdeDate = parseDateOnly(desde, inicioDefault);
    const hastaDate = parseDateOnly(hasta, ahora, true);
    const queryDesdeDate = new Date(desdeDate);
    queryDesdeDate.setDate(queryDesdeDate.getDate() - 1);
    const queryHastaDate = new Date(hastaDate);
    queryHastaDate.setDate(queryHastaDate.getDate() + 1);

    const filtro = {
      eliminado: { $ne: true },
      fechaInicio: { $gte: queryDesdeDate, $lte: queryHastaDate }
    };

    if (turno) filtro.turno = String(turno).toUpperCase();
    if (turnoNumero) filtro.turnoNumero = String(turnoNumero).trim();
    if (estado) filtro.estado = String(estado).toUpperCase();
    if (operador) filtro.operador = { $regex: String(operador), $options: "i" };

    if (esOperadorCaldera(rol)) {
      filtro.operador = new RegExp(`^\\s*${String(nombre || "").trim()}\\s*$`, "i");
    }

    const bitacoras = await Bitacora.find(filtro)
      .sort({ fechaInicio: 1 })
      .limit(500)
      .lean();

    console.log("📈 TENDENCIAS HISTORICAS FILTRO", {
      desde,
      hasta,
      desdeDate,
      hastaDate,
      queryDesdeDate,
      queryHastaDate,
      bitacoras: bitacoras.length
    });

    const ids = bitacoras.map(b => b._id);
    const registros = ids.length
      ? await RegistroOperacion.find({ bitacoraId: { $in: ids } }).lean()
      : [];

    const bitacoraMap = new Map(bitacoras.map(b => [String(b._id), b]));
    const parametrosMap = new Map();

    registros.forEach((registro) => {
      (registro.parametros || []).forEach((parametroItem) => {
        const label = String(parametroItem.label || "").trim();
        const value = toNumber(parametroItem.value);
        if (!label || value === null) return;

        if (!parametrosMap.has(label)) {
          parametrosMap.set(label, parametroItem.unidad || "");
        }
      });
    });

    const parametrosDisponibles = Array.from(parametrosMap.entries()).map(([label, unidad]) => ({
      label,
      unidad
    }));

    const parametroSolicitado = String(parametro || "").trim();
    const parametroMatch = parametroSolicitado
      ? parametrosDisponibles.find((p) => normalizeLabel(p.label) === normalizeLabel(parametroSolicitado))
      : null;
    const parametroFinal = String(parametroMatch?.label || parametrosDisponibles[0]?.label || "").trim();
    const unidadFinal = parametrosMap.get(parametroFinal) || "";

    const datosGrafico = [];

    registros.forEach((registro) => {
      const bitacora = bitacoraMap.get(String(registro.bitacoraId));
      if (!bitacora) return;

      const item = (registro.parametros || []).find(p => normalizeLabel(p.label) === normalizeLabel(parametroFinal));
      const value = toNumber(item?.value);
      if (value === null) return;

      const fechaHora = fechaHoraOperacional(bitacora.fechaInicio, registro.hora, bitacora.turno);
      if (fechaHora < desdeDate || fechaHora > hastaDate) return;

      datosGrafico.push({
        fecha: bitacora.fechaInicio,
        hora: registro.hora,
        fechaHora,
        turno: bitacora.turno,
        turnoNumero: bitacora.turnoNumero,
        operador: bitacora.operador,
        bitacoraId: bitacora._id,
        value
      });
    });

    datosGrafico.sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));

    const values = datosGrafico.map(p => p.value);
    const total = values.reduce((acc, value) => acc + value, 0);

    const resumen = {
      parametro: parametroFinal,
      unidad: unidadFinal,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      promedio: values.length ? Number((total / values.length).toFixed(2)) : null,
      ultimo: values.length ? values[values.length - 1] : null,
      totalPuntos: values.length
    };

    return res.json({
      filtros: {
        desde: desdeDate,
        hasta: hastaDate,
        turno,
        turnoNumero,
        operador,
        estado,
        parametro: parametroFinal
      },
      totalBitacoras: bitacoras.length,
      totalRegistros: registros.length,
      parametrosDisponibles,
      datosGrafico,
      resumen,
      actualizadoEn: new Date()
    });
  } catch (error) {
    console.error("Error tendencias historicas:", error);
    return res.status(500).json({ message: "Error obteniendo tendencias historicas" });
  }
};

/* =====================================================
   TENDENCIA RECEPCION COMBUSTIBLE
===================================================== */
export const obtenerTendenciasCombustible = async (req, res) => {
  try {
    const { rol, nombre } = req.user || {};

    if (!puedeVerTendenciasCaldera(rol)) {
      return res.status(403).json({ message: "No autorizado para ver tendencia combustible" });
    }

    const {
      desde = "",
      hasta = "",
      turno = "",
      turnoNumero = "",
      operador = ""
    } = req.query;

    const ahora = new Date();
    const inicioDefault = new Date();
    inicioDefault.setDate(ahora.getDate() - 30);
    inicioDefault.setHours(0, 0, 0, 0);

    const desdeDate = parseDateOnly(desde, inicioDefault);
    desdeDate.setHours(0, 0, 0, 0);

    const hastaDate = parseDateOnly(hasta, ahora);
    hastaDate.setHours(23, 59, 59, 999);

    const filtroBitacora = {
      eliminado: { $ne: true },
      estado: "CERRADA",
      fechaInicio: { $gte: desdeDate, $lte: hastaDate }
    };

    if (turno) filtroBitacora.turno = String(turno).toUpperCase();
    if (turnoNumero) filtroBitacora.turnoNumero = String(turnoNumero).trim();
    if (operador) filtroBitacora.operador = { $regex: String(operador), $options: "i" };

    if (esOperadorCaldera(rol)) {
      filtroBitacora.operador = new RegExp(`^\\s*${String(nombre || "").trim()}\\s*$`, "i");
    }

    const bitacoras = await Bitacora.find(filtroBitacora)
      .sort({ fechaInicio: 1 })
      .limit(500)
      .lean();

    const ids = bitacoras.map(bitacora => bitacora._id);
    const cierres = ids.length
      ? await CierreTurno.find({
          bitacoraId: { $in: ids },
          recepcionCombustible: "SI",
          litrosCombustible: { $gt: 0 }
        }).lean()
      : [];

    const bitacoraMap = new Map(bitacoras.map(bitacora => [String(bitacora._id), bitacora]));
    const recepciones = cierres
      .map((cierre) => {
        const bitacora = bitacoraMap.get(String(cierre.bitacoraId));
        if (!bitacora) return null;

        const litros = Number(cierre.litrosCombustible);
        if (!Number.isFinite(litros) || litros <= 0) return null;

        return {
          fecha: bitacora.fechaInicio,
          litros,
          turno: bitacora.turno,
          turnoNumero: bitacora.turnoNumero,
          operador: bitacora.operador,
          bitacoraId: bitacora._id
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const porDia = new Map();
    recepciones.forEach((item) => {
      const key = new Date(item.fecha).toISOString().slice(0, 10);
      const previo = porDia.get(key);

      if (previo) {
        previo.litros += item.litros;
        previo.recepciones += 1;
      } else {
        porDia.set(key, {
          fecha: key,
          litros: item.litros,
          recepciones: 1,
          turno: item.turno,
          turnoNumero: item.turnoNumero,
          operador: item.operador,
          bitacoraId: item.bitacoraId
        });
      }
    });

    const datosGrafico = Array.from(porDia.values())
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const totalLitros = recepciones.reduce((acc, item) => acc + item.litros, 0);
    const promedioDiario = datosGrafico.length ? Number((totalLitros / datosGrafico.length).toFixed(2)) : 0;
    const mayorCarga = recepciones.length
      ? recepciones.reduce((max, item) => item.litros > max.litros ? item : max, recepciones[0])
      : null;
    const ultimaRecepcion = recepciones.length ? recepciones[recepciones.length - 1] : null;

    return res.json({
      filtros: {
        desde: desdeDate,
        hasta: hastaDate,
        turno,
        turnoNumero,
        operador
      },
      totalLitros,
      promedioDiario,
      cantidadRecepciones: recepciones.length,
      mayorCarga,
      ultimaRecepcion,
      datosGrafico,
      actualizadoEn: new Date()
    });
  } catch (error) {
    console.error("Error tendencia combustible:", error);
    return res.status(500).json({ message: "Error obteniendo tendencia combustible" });
  }
};
