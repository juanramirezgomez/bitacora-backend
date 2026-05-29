import {
  asignarAlertaCamioneta,
  cerrarAlertaCamioneta,
  marcarAlertaEnProceso,
  resolverAlertaCamioneta
} from "../services/alertaCamionetaService.js";
import { registrarEvento } from "../services/operationalAuditService.js";

const mapAlerta = (alerta) => ({
  id: String(alerta._id),
  patente: alerta.patente || "-",
  tipo: alerta.tipo || "ALERTA_OPERACIONAL",
  descripcion: alerta.descripcion || alerta.observaciones || "",
  prioridad: alerta.prioridad || "MEDIA",
  estado: alerta.estado || "ABIERTA",
  responsable: alerta.responsable || "-",
  accionCorrectiva: alerta.accionCorrectiva || alerta.solucion || "",
  solucion: alerta.solucion || alerta.accionCorrectiva || "",
  observaciones: alerta.observaciones || "",
  fecha: alerta.fechaCreacion || alerta.createdAt,
  fechaAsignacion: alerta.fechaAsignacion || null,
  fechaResolucion: alerta.fechaResolucion || null,
  fechaCierre: alerta.fechaCierre || null,
  checklistId: alerta.checklistId || null,
  fotos: alerta.fotos || []
});

const requireAlerta = (alerta, res) => {
  if (alerta) return false;
  res.status(404).json({ message: "Alerta no encontrada" });
  return true;
};

export const asignarAlerta = async (req, res) => {
  try {
    const responsable = String(req.body?.responsable || "").trim();
    if (!responsable) return res.status(400).json({ message: "responsable es obligatorio" });

    const alerta = await asignarAlertaCamioneta({ id: req.params.id, user: req.user, responsable });
    if (requireAlerta(alerta, res)) return;

    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_ASIGNADA",
      observacion: `Alerta asignada a ${responsable}`
    });

    return res.json({ message: "Alerta asignada", alerta: mapAlerta(alerta) });
  } catch (error) {
    return res.status(500).json({ message: "Error asignando alerta" });
  }
};

export const ponerAlertaEnProceso = async (req, res) => {
  try {
    const alerta = await marcarAlertaEnProceso({
      id: req.params.id,
      user: req.user,
      responsable: req.body?.responsable,
      observaciones: req.body?.observaciones
    });
    if (requireAlerta(alerta, res)) return;

    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_EN_PROCESO",
      observacion: alerta.observaciones || "Alerta tomada en proceso"
    });

    return res.json({ message: "Alerta en proceso", alerta: mapAlerta(alerta) });
  } catch (error) {
    return res.status(500).json({ message: "Error cambiando alerta a en proceso" });
  }
};

export const resolverAlerta = async (req, res) => {
  try {
    const accionCorrectiva = String(req.body?.accionCorrectiva || req.body?.solucion || "").trim();
    if (!accionCorrectiva) return res.status(400).json({ message: "accionCorrectiva es obligatoria" });

    const alerta = await resolverAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      estado: "RESUELTA",
      solucion: accionCorrectiva,
      responsable: req.body?.responsable,
      observaciones: req.body?.observaciones
    });
    if (requireAlerta(alerta, res)) return;

    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_RESUELTA",
      observacion: accionCorrectiva
    });

    return res.json({ message: "Alerta resuelta", alerta: mapAlerta(alerta) });
  } catch (error) {
    return res.status(500).json({ message: "Error resolviendo alerta" });
  }
};

export const cerrarAlerta = async (req, res) => {
  try {
    const accionCorrectiva = String(req.body?.accionCorrectiva || req.body?.solucion || "").trim();
    if (!accionCorrectiva) return res.status(400).json({ message: "accionCorrectiva es obligatoria para cerrar" });

    const alerta = await cerrarAlertaCamioneta({
      id: req.params.id,
      user: req.user,
      solucion: accionCorrectiva,
      observaciones: req.body?.observaciones
    });
    if (requireAlerta(alerta, res)) return;

    await registrarEvento({
      req,
      modulo: "ALERTAS",
      entidad: "AlertaCamioneta",
      entidadId: alerta._id,
      accion: "ALERTA_CERRADA",
      observacion: accionCorrectiva
    });

    return res.json({ message: "Alerta cerrada", alerta: mapAlerta(alerta) });
  } catch (error) {
    return res.status(500).json({ message: "Error cerrando alerta" });
  }
};
