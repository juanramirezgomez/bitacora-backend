export const ALERT_PRIORITIES = {
  CRITICA: { color: "#DC2626", label: "Critica" },
  ALTA: { color: "#EA580C", label: "Alta" },
  MEDIA: { color: "#CA8A04", label: "Media" },
  INFORMATIVA: { color: "#2563EB", label: "Informativa" }
};

export const ALERT_TEMPLATES = {
  LICENCIA_VENCIDA: {
    prioridad: "CRITICA",
    whatsapp: { title: "Licencia municipal vencida" },
    email: { subject: "Licencia municipal vencida detectada" }
  },
  LICENCIA_POR_VENCER: {
    prioridad: "ALTA",
    whatsapp: { title: "Licencia municipal proxima a vencer" },
    email: { subject: "Licencia municipal proxima a vencer" }
  },
  LICENCIA_INTERNA_VENCIDA: {
    prioridad: "CRITICA",
    whatsapp: { title: "Licencia interna vencida" },
    email: { subject: "Licencia interna vencida detectada" }
  },
  LICENCIA_INTERNA_POR_VENCER: {
    prioridad: "ALTA",
    whatsapp: { title: "Licencia interna proxima a vencer" },
    email: { subject: "Licencia interna proxima a vencer" }
  },
  REVISION_TECNICA_VENCIDA: {
    prioridad: "CRITICA",
    whatsapp: { title: "Revision tecnica vencida" },
    email: { subject: "Revision tecnica vencida detectada" }
  },
  REVISION_TECNICA_POR_VENCER: {
    prioridad: "ALTA",
    whatsapp: { title: "Revision tecnica proxima a vencer" },
    email: { subject: "Revision tecnica proxima a vencer" }
  },
  PERMISO_CIRCULACION_VENCIDO: {
    prioridad: "CRITICA",
    whatsapp: { title: "Permiso de circulacion vencido" },
    email: { subject: "Permiso de circulacion vencido detectado" }
  },
  PERMISO_CIRCULACION_POR_VENCER: {
    prioridad: "ALTA",
    whatsapp: { title: "Permiso de circulacion proximo a vencer" },
    email: { subject: "Permiso de circulacion proximo a vencer" }
  },
  SEGURO_OBLIGATORIO_VENCIDO: {
    prioridad: "CRITICA",
    whatsapp: { title: "Seguro obligatorio vencido" },
    email: { subject: "Seguro obligatorio vencido detectado" }
  },
  SEGURO_OBLIGATORIO_POR_VENCER: {
    prioridad: "ALTA",
    whatsapp: { title: "Seguro obligatorio proximo a vencer" },
    email: { subject: "Seguro obligatorio proximo a vencer" }
  },
  CERTIFICACION_INTERNA_VENCIDA: {
    prioridad: "CRITICA",
    whatsapp: { title: "Certificacion interna vencida" },
    email: { subject: "Certificacion interna vencida detectada" }
  },
  CERTIFICACION_INTERNA_POR_VENCER: {
    prioridad: "ALTA",
    whatsapp: { title: "Certificacion interna proxima a vencer" },
    email: { subject: "Certificacion interna proxima a vencer" }
  },
  MANTENCION_PROXIMA: {
    prioridad: "ALTA",
    whatsapp: { title: "Mantencion proxima o vencida" },
    email: { subject: "Alerta de mantencion de camioneta" }
  },
  FRENOS_MALOS: {
    prioridad: "CRITICA",
    whatsapp: { title: "Frenos con condicion mala" },
    email: { subject: "Alerta critica en frenos" }
  },
  LUCES_MALAS: {
    prioridad: "ALTA",
    whatsapp: { title: "Luces con condicion mala" },
    email: { subject: "Alerta en sistema de luces" }
  },
  ALERTA_CRITICA: {
    prioridad: "CRITICA",
    whatsapp: { title: "Alerta critica checklist camioneta" },
    email: { subject: "Alerta critica checklist camioneta" }
  },
  CONDICION_NO_CRITICA: {
    prioridad: "BAJA",
    whatsapp: { title: "Condicion no critica detectada" },
    email: { subject: "Condicion no critica en checklist camioneta" }
  },
  FATIGA_SOMNOLENCIA: {
    prioridad: "MEDIA",
    whatsapp: { title: "Hallazgo de fatiga o somnolencia" },
    email: { subject: "Hallazgo de fatiga o somnolencia en checklist" }
  },
  DOCUMENTACION_INCOMPLETA: {
    prioridad: "MEDIA",
    whatsapp: { title: "Documentacion incompleta" },
    email: { subject: "Documentacion incompleta en checklist camioneta" }
  }
};

export const getAlertTemplate = (tipo) =>
  ALERT_TEMPLATES[tipo] || ALERT_TEMPLATES.ALERTA_CRITICA;
