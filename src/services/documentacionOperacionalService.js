import mongoose from "mongoose";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import AlertaSeguimiento from "../models/AlertaSeguimiento.js";
import { registrarEvento } from "./operationalAuditService.js";
import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import { generarAlertasChecklist } from "./alertService.js";
import { sincronizarAlertasOperacionalesChecklist } from "./alertaCamionetaService.js";

const TIPOS_DOCUMENTALES = [
  "DOCUMENTACION_INCOMPLETA",
  "LICENCIA_VENCIDA",
  "LICENCIA_POR_VENCER",
  "LICENCIA_B_VENCIDA",
  "LICENCIA_B_POR_VENCER",
  "LICENCIA_INTERNA_VENCIDA",
  "LICENCIA_INTERNA_POR_VENCER"
];

const userId = (user = {}) => user?._id || user?.id || user?.uid || null;

const fechaVigente = (value) => {
  if (!value) return false;
  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fecha.setHours(0, 0, 0, 0);
  return fecha >= hoy;
};

const licenciaInternaActiva = (value) => {
  if (value === true) return true;
  if (typeof value === "string") return ["SI", "TRUE", "VIGENTE", "ACTIVA", "ACTIVO"].includes(normalizar(value));
  if (value && typeof value === "object") {
    return ["VIGENTE", "POR_VENCER", "ACTIVA", "ACTIVO"].includes(normalizar(value.estado || value.status)) ||
      Boolean(value.fechaVencimiento || value.fechaVencimientoLicenciaInterna);
  }
  return false;
};

const normalizar = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const alertaResueltaPorDocumentacion = (alerta, user) => {
  const texto = normalizar(`${alerta.tipo} ${alerta.descripcion} ${alerta.observaciones}`);
  const claseBVigente = user.licenciaClaseB === true && fechaVigente(user.fechaVencimientoLicenciaB);
  const internaVigente = licenciaInternaActiva(user.licenciaInterna) && fechaVigente(user.fechaVencimientoLicenciaInterna);

  if (texto.includes("INTERNA")) return internaVigente;
  if (texto.includes("CLASE B") || texto.includes("LICENCIA_VENCIDA") || texto.includes("LICENCIA_POR_VENCER") || texto.includes("LICENCIA B")) {
    return claseBVigente;
  }

  if (alerta.tipo === "DOCUMENTACION_INCOMPLETA") {
    return claseBVigente && internaVigente;
  }

  return false;
};

const registrarResolucionAutomatica = async (alerta, user, comentario, estadoAnterior) => {
  await AlertaSeguimiento.create({
    alertaId: alerta._id,
    usuarioId: userId(user),
    nombreUsuario: user.nombre || "Usuario",
    rol: user.rol || "",
    tipoEvento: "RESOLUCION_AUTOMATICA",
    estadoAnterior,
    estadoNuevo: "CERRADA",
    comentario,
    fecha: new Date()
  });

  await registrarEvento({
    usuario: user,
    modulo: "ALERTAS",
    entidad: "AlertaCamioneta",
    entidadId: alerta._id,
    accion: "ALERTA_CERRADA",
    observacion: comentario
  });
};

export const reevaluarAlertasDocumentales = async (usuario) => {
  const id = userId(usuario);
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    return { evaluadas: 0, cerradas: 0 };
  }

  const alertas = await AlertaCamioneta.find({
    activo: { $ne: false },
    creadoPor: id,
    tipo: { $in: TIPOS_DOCUMENTALES },
    estado: { $in: ["ABIERTA", "EN_GESTION"] }
  }).limit(200);

  let cerradas = 0;
  const comentario = "Alerta resuelta automaticamente por actualizacion de documentacion operacional.";
  for (const alerta of alertas) {
    if (!alertaResueltaPorDocumentacion(alerta, usuario)) continue;
    const estadoAnterior = alerta.estado;
    alerta.estado = "CERRADA";
    alerta.fechaResolucion = new Date();
    alerta.fechaCierre = new Date();
    alerta.fechaUltimoMovimiento = new Date();
    alerta.resueltoPor = id;
    alerta.resolucionAutomatica = true;
    alerta.accionCorrectiva = comentario;
    alerta.solucion = comentario;
    alerta.comentarioCierre = comentario;
    await alerta.save();
    await registrarResolucionAutomatica(alerta, usuario, comentario, estadoAnterior);
    cerradas += 1;
  }

  console.log("✅ ALERTAS DOCUMENTALES REEVALUADAS", { usuarioId: String(id), evaluadas: alertas.length, cerradas });
  const checklists = await ChecklistCamioneta.find({
    creadoPor: id,
    eliminado: { $ne: true },
    estado: { $in: ["FINALIZADO", "REVISADO"] }
  })
    .sort({ fechaInspeccion: -1, createdAt: -1 })
    .limit(100)
    .populate("creadoPor", "nombre email correoCorporativo correoRespaldo telefono rol estado activo preferenciasAlertas");

  for (const checklist of checklists) {
    checklist.licenciaClaseB = usuario.licenciaClaseB === true;
    checklist.fechaVencimientoLicenciaB = usuario.fechaVencimientoLicenciaB || null;
    checklist.licenciaInterna = licenciaInternaActiva(usuario.licenciaInterna);
    checklist.fechaVencimientoLicenciaInterna = usuario.fechaVencimientoLicenciaInterna || null;
    checklist.documentacion = (checklist.documentacion || []).map((documento) => {
      const nombre = normalizar(documento.nombre);
      if (nombre === "LICENCIA MUNICIPAL") {
        documento.fechaVencimiento = usuario.fechaVencimientoLicenciaB || null;
        documento.estado = checklist.licenciaClaseB && fechaVigente(documento.fechaVencimiento) ? "VIGENTE" : "VENCIDO";
      }
      if (nombre === "LICENCIA INTERNA") {
        documento.fechaVencimiento = usuario.fechaVencimientoLicenciaInterna || null;
        documento.estado = checklist.licenciaInterna && fechaVigente(documento.fechaVencimiento) ? "VIGENTE" : "VENCIDO";
      }
      return documento;
    });
    await sincronizarAlertasOperacionalesChecklist(checklist, await generarAlertasChecklist(checklist));
  }

  return { evaluadas: alertas.length + checklists.length, cerradas, consolidadosReevaluados: checklists.length };
};
