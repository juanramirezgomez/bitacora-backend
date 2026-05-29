import mongoose from "mongoose";
import OperationalAudit from "../models/OperationalAudit.js";

const cleanObjectId = (value) => {
  const id = value?._id || value?.id || value?.uid || value?.sub || value;
  return mongoose.Types.ObjectId.isValid(String(id || "")) ? id : null;
};

const usuarioAudit = (reqOrUser = {}) => {
  const user = reqOrUser?.user || reqOrUser || {};
  return {
    usuarioId: cleanObjectId(user),
    nombreUsuario: user?.nombre || "",
    username: user?.username || user?.operadorId || "",
    email: user?.email || user?.correoCorporativo || "",
    rol: user?.rol || "",
    planta: user?.planta || ""
  };
};

export const registrarEvento = async ({
  req = null,
  usuario = null,
  modulo,
  entidad,
  entidadId,
  accion,
  resultado = "OK",
  observacion = ""
}) => {
  try {
    console.log("\u{1F4CB} AUDITORIA OPERACIONAL", { modulo, accion, resultado });
    const doc = await OperationalAudit.create({
      ...usuarioAudit(req || usuario || {}),
      modulo,
      entidad: entidad || "",
      entidadId: cleanObjectId(entidadId),
      accion,
      resultado,
      observacion,
      fecha: new Date()
    });
    console.log("\u2705 EVENTO REGISTRADO", {
      id: String(doc._id),
      modulo: doc.modulo,
      accion: doc.accion,
      entidadId: String(doc.entidadId || "")
    });
    return doc;
  } catch (error) {
    console.error("ERROR AUDITORIA OPERACIONAL:", error?.message || error);
    return null;
  }
};

export const registrarBitacoraCreada = (req, bitacora) =>
  registrarEvento({
    req,
    modulo: "BITACORA_CALDERA",
    entidad: "Bitacora",
    entidadId: bitacora?._id,
    accion: "BITACORA_CREADA",
    observacion: `Bitacora creada turno ${bitacora?.turno || ""} ${bitacora?.turnoNumero || ""}`.trim()
  });

export const registrarBitacoraCerrada = (req, bitacora) => {
  console.log("\u{1F525} BITACORA CERRADA", { bitacoraId: String(bitacora?._id || "") });
  return registrarEvento({
    req,
    modulo: "BITACORA_CALDERA",
    entidad: "Bitacora",
    entidadId: bitacora?._id,
    accion: "BITACORA_CERRADA",
    observacion: `Bitacora cerrada turno ${bitacora?.turno || ""} ${bitacora?.turnoNumero || ""}`.trim()
  });
};

export const registrarChecklistCreado = (req, checklist) =>
  registrarEvento({
    req,
    modulo: "CHECKLIST_CAMIONETA",
    entidad: "ChecklistCamioneta",
    entidadId: checklist?._id,
    accion: "CHECKLIST_CREADO",
    observacion: `Checklist camioneta creado patente ${checklist?.patente || ""}`.trim()
  });

export const registrarChecklistFinalizado = (req, checklist) => {
  console.log("\u{1F69B} CHECKLIST FINALIZADO", { checklistId: String(checklist?._id || "") });
  return registrarEvento({
    req,
    modulo: "CHECKLIST_CAMIONETA",
    entidad: "ChecklistCamioneta",
    entidadId: checklist?._id,
    accion: "CHECKLIST_FINALIZADO",
    observacion: `Checklist finalizado patente ${checklist?.patente || ""}`.trim()
  });
};

export const registrarChecklistRevisado = (req, checklist) =>
  registrarEvento({
    req,
    modulo: "CHECKLIST_CAMIONETA",
    entidad: "ChecklistCamioneta",
    entidadId: checklist?._id,
    accion: "CHECKLIST_REVISADO",
    observacion: `Checklist revisado patente ${checklist?.patente || ""}`.trim()
  });

export const registrarPdfDescargado = ({ req, modulo, entidad, entidadId, observacion = "" }) => {
  console.log("\u{1F4C4} PDF DESCARGADO", { modulo, entidadId: String(entidadId || "") });
  return registrarEvento({ req, modulo, entidad, entidadId, accion: "PDF_DESCARGADO", observacion });
};

export const registrarExcelDescargado = ({ req, modulo, entidad, entidadId, observacion = "" }) => {
  console.log("\u{1F4CA} EXCEL DESCARGADO", { modulo, entidadId: String(entidadId || "") });
  return registrarEvento({ req, modulo, entidad, entidadId, accion: "EXCEL_DESCARGADO", observacion });
};

export const registrarRegistroEliminado = ({ req, modulo, entidad, entidadId, observacion = "" }) =>
  registrarEvento({ req, modulo, entidad, entidadId, accion: "BITACORA_ELIMINADA", observacion });
