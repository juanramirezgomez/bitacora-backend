import mongoose from "mongoose";
import AlertaCamioneta from "../models/AlertaCamioneta.js";
import AlertaSeguimiento from "../models/AlertaSeguimiento.js";
import { registrarEvento } from "./operationalAuditService.js";

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

const normalizar = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const alertaResueltaPorDocumentacion = (alerta, user) => {
  const texto = normalizar(`${alerta.tipo} ${alerta.descripcion} ${alerta.observaciones}`);
  const claseBVigente = user.licenciaClaseB === true && fechaVigente(user.fechaVencimientoLicenciaB);
  const internaVigente = user.licenciaInterna === true && fechaVigente(user.fechaVencimientoLicenciaInterna);

  if (texto.includes("INTERNA")) return internaVigente;
  if (texto.includes("CLASE B") || texto.includes("LICENCIA_VENCIDA") || texto.includes("LICENCIA_POR_VENCER") || texto.includes("LICENCIA B")) {
    return claseBVigente;
  }

  if (alerta.tipo === "DOCUMENTACION_INCOMPLETA") {
    return claseBVigente && internaVigente;
  }

  return false;
};

const registrarCierreAutomatico = async (alerta, user, comentario) => {
  await AlertaSeguimiento.create({
    alertaId: alerta._id,
    usuarioId: userId(user),
    nombreUsuario: user.nombre || "Usuario",
    rol: user.rol || "",
    tipoEvento: "CAMBIO_ESTADO",
    estadoAnterior: "ABIERTA",
    estadoNuevo: "CERRADA",
    comentario,
    fecha: new Date()
  });

  await registrarEvento({
    usuario: user,
    modulo: "ALERTAS",
    entidad: "AlertaCamioneta",
    entidadId: alerta._id,
    accion: "ALERTA_RESUELTA",
    observacion: comentario
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
    estado: { $in: ["ABIERTA", "ASIGNADA", "EN_PROCESO"] }
  }).limit(200);

  let cerradas = 0;
  const comentario = "Alerta resuelta automaticamente por actualizacion de documentacion operacional.";
  for (const alerta of alertas) {
    if (!alertaResueltaPorDocumentacion(alerta, usuario)) continue;
    alerta.estado = "CERRADA";
    alerta.fechaResolucion = new Date();
    alerta.fechaCierre = new Date();
    alerta.fechaUltimoMovimiento = new Date();
    alerta.resueltoPor = id;
    alerta.cerradoPor = id;
    alerta.accionCorrectiva = comentario;
    alerta.solucion = comentario;
    await alerta.save();
    await registrarCierreAutomatico(alerta, usuario, comentario);
    cerradas += 1;
  }

  console.log("✅ ALERTAS DOCUMENTALES REEVALUADAS", { usuarioId: String(id), evaluadas: alertas.length, cerradas });
  return { evaluadas: alertas.length, cerradas };
};

