import Bitacora from "../models/Bitacora.js";

/* =====================================================
   INICIAR TURNO
   POST /api/bitacoras/iniciar
===================================================== */
export const iniciarTurno = async (req, res) => {
  try {

    let { turno, turnoNumero, fechaInicio } = req.body || {};
    let { nombre, rol } = req.user;

    nombre = String(nombre).trim();

    /* =========================================
       VALIDACIONES BÁSICAS
    ========================================= */

    if (rol !== "OPERADOR") {
      return res.status(403).json({
        message: "Solo OPERADOR puede iniciar turno"
      });
    }

    if (!turno || !turnoNumero) {
      return res.status(400).json({
        message: "turno y turnoNumero son obligatorios"
      });
    }

    turno = String(turno).trim();
    turnoNumero = String(turnoNumero).trim();

    /* =========================================
       VALIDAR QUE NO TENGA BITÁCORA ABIERTA
    ========================================= */

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

    /* =========================================
       PROCESAR FECHA (SIN PROBLEMAS DE UTC)
    ========================================= */

    let fechaFinal;

    if (fechaInicio) {

      const partes = fechaInicio.split("-");

      if (partes.length !== 3) {
        return res.status(400).json({
          message: "Formato de fecha inválido"
        });
      }

      const year = parseInt(partes[0]);
      const month = parseInt(partes[1]) - 1;
      const day = parseInt(partes[2]);

      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return res.status(400).json({
          message: "Fecha inválida"
        });
      }

      // 🔥 Fecha local real (NO UTC)
      fechaFinal = new Date(year, month, day, 12, 0, 0)

    } else {

      const hoy = new Date();

      fechaFinal = new Date(
        hoy.getFullYear(),
        hoy.getMonth(),
        hoy.getDate(),
        12, 0, 0
      );
    }

    /* =========================================
       CREAR BITÁCORA
    ========================================= */

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
   OBTENER BITÁCORA ABIERTA
   GET /api/bitacoras/abierta
===================================================== */
export const obtenerBitacoraAbierta = async (req, res) => {
  try {

    let { nombre, rol } = req.user;
    nombre = String(nombre).trim();

    if (rol !== "OPERADOR") {
      return res.status(403).json({
        message: "Solo OPERADOR puede consultar bitácora abierta"
      });
    }

    const abierta = await Bitacora.findOne({
      operador: new RegExp(`^\\s*${nombre}\\s*$`, "i"),
      estado: "ABIERTA"
    });

    return res.json({
      bitacora: abierta || null
    });

  } catch (error) {
    console.error("🔥 Error obtenerBitacoraAbierta:", error);
    return res.status(500).json({
      message: "Error buscando bitácora abierta"
    });
  }
};


/* =====================================================
   LISTAR BITÁCORAS
   GET /api/bitacoras
===================================================== */
export const listarBitacoras = async (req, res) => {
  try {

    let { rol, nombre } = req.user;
    const { estado } = req.query;

    nombre = String(nombre).trim();

    const filtro = {};

    // OPERADOR → solo sus bitácoras
    if (rol === "OPERADOR") {
      filtro.operador = new RegExp(`^\\s*${nombre}\\s*$`, "i");
    }

    // SUPERVISOR → solo cerradas por defecto
    if (rol === "SUPERVISOR") {
      filtro.estado = "CERRADA";
    }

    // Si viene estado por query lo respetamos
    if (estado) {
      filtro.estado = estado;
    }

    const bitacoras = await Bitacora.find(filtro)
      .sort({ fechaInicio: -1 });

    return res.json(bitacoras);

  } catch (error) {
    console.error("🔥 Error listarBitacoras:", error);
    return res.status(500).json({
      message: "Error listando bitácoras"
    });
  }
};


/* =====================================================
   OBTENER BITÁCORA POR ID
   GET /api/bitacoras/:bitacoraId
===================================================== */
export const obtenerBitacora = async (req, res) => {
  try {

    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findById(bitacoraId);

    if (!bitacora) {
      return res.status(404).json({
        message: "Bitácora no encontrada"
      });
    }

    return res.json(bitacora);

  } catch (error) {
    console.error("🔥 Error obtenerBitacora:", error);
    return res.status(500).json({
      message: "Error obteniendo bitácora"
    });
  }
};