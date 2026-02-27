import Bitacora from "../models/Bitacora.js";

/* =====================================================
   INICIAR TURNO
   POST /api/bitacoras/iniciar
===================================================== */
export const iniciarTurno = async (req, res) => {
  try {
    let { turno, turnoNumero } = req.body || {};
    const { nombre, rol } = req.user;

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

    // 🔒 VALIDAR QUE NO TENGA UNA ABIERTA
    const existeAbierta = await Bitacora.findOne({
      operador: nombre,
      estado: "ABIERTA"
    });

    if (existeAbierta) {
      return res.status(409).json({
        message: "Ya tienes una bitácora abierta",
        bitacora: existeAbierta
      });
    }

    const nuevaBitacora = await Bitacora.create({
      operador: nombre,
      turno,
      turnoNumero,
      estado: "ABIERTA",
      fechaInicio: new Date()
    });

    return res.status(201).json(nuevaBitacora);

  } catch (error) {
    console.error(error);
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
    const { nombre, rol } = req.user;

    if (rol !== "OPERADOR") {
      return res.status(403).json({
        message: "Solo OPERADOR puede consultar bitácora abierta"
      });
    }

    const abierta = await Bitacora.findOne({
      operador: nombre,
      estado: "ABIERTA"
    });

    return res.json({ abierta: abierta || null });

  } catch (error) {
    console.error(error);
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
    const { rol, nombre } = req.user;
    const { estado } = req.query;

    const filtro = {};

    if (rol === "OPERADOR") {
      filtro.operador = nombre;
    }

    if (rol === "SUPERVISOR") {
      filtro.estado = "CERRADA";
    }

    if (estado) {
      filtro.estado = estado;
    }

    const bitacoras = await Bitacora.find(filtro)
      .sort({ fechaInicio: -1 });

    return res.json(bitacoras);

  } catch (error) {
    console.error(error);
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
    console.error(error);
    return res.status(500).json({
      message: "Error obteniendo bitácora"
    });
  }
};
