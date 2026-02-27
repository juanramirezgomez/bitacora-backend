import Bitacora from "../models/Bitacora.js";
import ChecklistInicial from "../models/ChecklistInicial.js";

// POST /api/bitacoras/:bitacoraId/checklist-inicial
export const crearChecklistInicial = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findById(bitacoraId);
    if (!bitacora)
      return res.status(404).json({ message: "Bitácora no encontrada" });

    if (bitacora.estado !== "ABIERTA") {
      return res.status(400).json({ message: "La bitácora está cerrada" });
    }

    const existe = await ChecklistInicial.findOne({ bitacoraId });
    if (existe) {
      return res.status(409).json({
        message: "Ya existe checklist inicial para esta bitácora",
      });
    }

    const {
      calderaHurst,
      bombaAlimentacionAgua,
      bombaPetroleo,
      nivelAguaTuboNivel,
      purgaSuperficie,
      bombaDosificadoraQuimicos,
      trenGas,
      ablandadores,
      observacionesIniciales = "",
    } = req.body || {};

    const faltan = [];

    if (!calderaHurst) faltan.push("calderaHurst");
    if (!bombaAlimentacionAgua) faltan.push("bombaAlimentacionAgua");
    if (!bombaPetroleo) faltan.push("bombaPetroleo");
    if (!nivelAguaTuboNivel) faltan.push("nivelAguaTuboNivel");
    if (!purgaSuperficie) faltan.push("purgaSuperficie");
    if (!bombaDosificadoraQuimicos) faltan.push("bombaDosificadoraQuimicos");
    if (!trenGas) faltan.push("trenGas");
    if (!ablandadores) faltan.push("ablandadores");

    if (faltan.length) {
      return res.status(400).json({
        message: "Faltan campos obligatorios",
        faltan,
      });
    }

    // ✅ Validaciones nuevas según tu diseño

    const servicioEnum = ["EN_SERVICIO", "FUERA_DE_SERVICIO"];
    const nivelEnum = ["BAJO", "NORMAL", "LLENO"];

    const camposServicio = [
      calderaHurst,
      bombaAlimentacionAgua,
      bombaPetroleo,
      purgaSuperficie,
      bombaDosificadoraQuimicos,
      trenGas,
      ablandadores,
    ];

    for (const valor of camposServicio) {
      if (!servicioEnum.includes(valor)) {
        return res.status(400).json({
          message:
            "Valores inválidos. Use EN_SERVICIO o FUERA_DE_SERVICIO",
        });
      }
    }

    if (!nivelEnum.includes(nivelAguaTuboNivel)) {
      return res.status(400).json({
        message:
          "nivelAguaTuboNivel inválido. Use BAJO, NORMAL o LLENO",
      });
    }

    const nuevo = await ChecklistInicial.create({
      bitacoraId,
      calderaHurst,
      bombaAlimentacionAgua,
      bombaPetroleo,
      nivelAguaTuboNivel,
      purgaSuperficie,
      bombaDosificadoraQuimicos,
      trenGas,
      ablandadores,
      observacionesIniciales,
    });

    return res.status(201).json(nuevo);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error creando checklist" });
  }
};

// GET /api/bitacoras/:bitacoraId/checklist-inicial
export const obtenerChecklistInicial = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    const checklist = await ChecklistInicial.findOne({ bitacoraId });

    if (!checklist)
      return res.status(404).json({ message: "Checklist no encontrado" });

    return res.json(checklist);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error obteniendo checklist" });
  }
};

// GET /api/bitacoras/:bitacoraId/checklist-inicial/existe
export const existeChecklistInicial = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    const c = await ChecklistInicial.findOne({ bitacoraId }).select("_id");

    return res.json({ existe: !!c });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error verificando checklist" });
  }
};
