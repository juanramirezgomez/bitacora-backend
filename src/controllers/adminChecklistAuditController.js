import { auditarAptitudChecklists } from "../services/checklistAptitudAuditService.js";
import { registrarEvento } from "../services/operationalAuditService.js";

export const recalcularAptitudChecklists = async (req, res) => {
  try {
    const resultado = await auditarAptitudChecklists({ actualizar: true });
    await registrarEvento({
      req,
      modulo: "CHECKLIST_CAMIONETA",
      entidad: "ChecklistCamioneta",
      accion: "RECALCULO_APTITUD_HISTORICA",
      observacion: `Aptitud historica recalculada: ${resultado.totalAnalizados} analizados, ${resultado.totalCorregidos} corregidos.`
    });
    return res.json(resultado);
  } catch (error) {
    console.error("ERROR RECALCULANDO APTITUD HISTORICA", error);
    return res.status(500).json({ message: "Error recalculando aptitud de checklist historicos" });
  }
};
