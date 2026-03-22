import Bitacora from "../models/Bitacora.js";
import ChecklistInicial from "../models/ChecklistInicial.js";
import RegistroOperacion from "../models/RegistroOperacion.js";
import CierreTurno from "../models/CierreTurno.js";

/* =====================================================
   INICIAR TURNO
===================================================== */
export const iniciarTurno = async (req, res) => {
  try {

    let { turno, turnoNumero, fechaInicio } = req.body || {};
    let { nombre, rol } = req.user;

    nombre = String(nombre).trim();

    /* ================= VALIDACIONES ================= */

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

    if (rol !== "OPERADOR") {
      return res.status(403).json({
        message: "Solo OPERADOR puede consultar"
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
    const { estado } = req.query;

    nombre = String(nombre).trim();

    const filtro = {};

    if (rol === "OPERADOR") {
      filtro.operador = new RegExp(`^\\s*${nombre}\\s*$`, "i");
    }

    if (estado) {
      filtro.estado = estado;
    }

    let bitacoras = await Bitacora.find(filtro)
      .sort({ fechaInicio: -1 });

    // 🔥 SANITIZAR DATOS (ANTI DIAMETRO)
    bitacoras = bitacoras.map(b => {
      const turnoValido = ["DIA", "NOCHE"].includes(b.turno)
        ? b.turno
        : "NOCHE"; // fallback seguro

      return {
        ...b.toObject(),
        turno: turnoValido
      };
    });

    return res.json(bitacoras);

  } catch (error) {
    console.error("🔥 Error listarBitacoras:", error);
    return res.status(500).json({
      message: "Error listando bitácoras"
    });
  }
};


/* =====================================================
   OBTENER POR ID
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

    const bitacora = await Bitacora.findById(bitacoraId);

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

    await Promise.all([
      ChecklistInicial.deleteMany({ bitacoraId }),
      RegistroOperacion.deleteMany({ bitacoraId }),
      CierreTurno.deleteMany({ bitacoraId })
    ]);

    await Bitacora.findByIdAndDelete(bitacoraId);

    res.json({ message: "Eliminada correctamente" });

  } catch (error) {
    console.error("Error eliminando:", error);
    res.status(500).json({
      message: "Error eliminando bitácora"
    });
  }
};