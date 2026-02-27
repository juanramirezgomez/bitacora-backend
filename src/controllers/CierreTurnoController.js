import mongoose from "mongoose";
import Bitacora from "../models/Bitacora.js";
import ChecklistInicial from "../models/ChecklistInicial.js";
import CierreTurno from "../models/CierreTurno.js";
import RegistroOperacion from "../models/RegistroOperacion.js";
import { generarReportePdfInterno } from "./reportePdfController.js";

const toNumOrUndef = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s === "") return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export const crearCierreTurno = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bitacoraId)) {
      return res.status(400).json({ message: "bitacoraId inválido" });
    }

    const objectId = new mongoose.Types.ObjectId(bitacoraId);

    const bitacora = await Bitacora.findById(objectId);
    if (!bitacora)
      return res.status(404).json({ message: "Bitácora no encontrada" });

    if (bitacora.estado !== "ABIERTA")
      return res.status(400).json({ message: "La bitácora está cerrada" });

    const rol = String(req.user?.rol || "").toUpperCase();
    const nombre = String(req.user?.nombre || "").trim();

    if (rol !== "OPERADOR")
      return res.status(403).json({ message: "Solo OPERADOR puede cerrar turno" });

    if (bitacora.operador !== nombre)
      return res.status(403).json({
        message: "No puedes cerrar una bitácora que no es tuya",
      });

    // ✅ Checklist obligatorio
    const checklist = await ChecklistInicial.findOne({ bitacoraId: objectId });
    if (!checklist)
      return res.status(400).json({
        message: "No se puede cerrar: falta checklist inicial",
      });

    // ✅ Debe existir al menos un registro
    const totalRegistros = await RegistroOperacion.countDocuments({
      bitacoraId: objectId,
    });

    if (totalRegistros === 0)
      return res.status(400).json({
        message: "No se puede cerrar: falta al menos un registro de operación",
      });

    // ✅ Evitar duplicado
    const existe = await CierreTurno.findOne({ bitacoraId: objectId });
    if (existe)
      return res.status(409).json({
        message: "Ya existe cierre para esta bitácora",
      });

    const {
      recepcionCombustible,
      litrosCombustible,
      tk28EnServicio,
      tk28Porcentaje,
      comentariosFinales = "",
      firmaBase64 = "",
    } = req.body || {};

    if (!recepcionCombustible || !tk28EnServicio)
      return res.status(400).json({
        message: "Faltan campos obligatorios",
      });

    const rc = String(recepcionCombustible).toUpperCase();
    const tk = String(tk28EnServicio).toUpperCase();

    if (!["SI", "NO"].includes(rc))
      return res.status(400).json({
        message: "recepcionCombustible debe ser SI o NO",
      });

    if (!["SI", "NO"].includes(tk))
      return res.status(400).json({
        message: "tk28EnServicio debe ser SI o NO",
      });

    let litros = undefined;
    if (rc === "SI") {
      litros = toNumOrUndef(litrosCombustible);
      if (!Number.isFinite(litros) || litros < 0)
        return res.status(400).json({
          message: "litrosCombustible inválido",
        });
    }

    let pct = undefined;
    if (tk === "SI") {
      pct = toNumOrUndef(tk28Porcentaje);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100)
        return res.status(400).json({
          message: "tk28Porcentaje inválido",
        });
    }

    // 🔥 Crear cierre
    const cierre = await CierreTurno.create({
      bitacoraId: objectId,
      recepcionCombustible: rc,
      litrosCombustible: litros,
      tk28EnServicio: tk,
      tk28Porcentaje: pct,
      comentariosFinales,
      firmaBase64,
    });

    // 🔥 Cerrar bitácora
    bitacora.estado = "CERRADA";
    bitacora.fechaCierre = new Date();
    await bitacora.save();

    // 🔥 Generar PDF automático
    try {
      await generarReportePdfInterno(objectId);
    } catch (pdfError) {
      console.error("Error generando PDF automático:", pdfError);
    }

    return res.json({
      message: "Turno cerrado correctamente",
      bitacora,
      cierre,
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: "Error creando cierre",
    });
  }
};

export const obtenerCierreTurno = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bitacoraId)) {
      return res.status(400).json({ message: "bitacoraId inválido" });
    }

    const objectId = new mongoose.Types.ObjectId(bitacoraId);

    const bitacora = await Bitacora.findById(objectId);
    if (!bitacora)
      return res.status(404).json({
        message: "Bitácora no encontrada",
      });

    const rol = String(req.user?.rol || "").toUpperCase();
    const nombre = String(req.user?.nombre || "").trim();

    if (rol === "OPERADOR" && bitacora.operador !== nombre) {
      return res.status(403).json({
        message: "No puedes ver cierre de otra bitácora",
      });
    }

    const cierre = await CierreTurno.findOne({ bitacoraId: objectId });
    if (!cierre)
      return res.status(404).json({
        message: "Cierre no encontrado",
      });

    return res.json(cierre);

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: "Error obteniendo cierre",
    });
  }
};
