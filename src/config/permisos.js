const PERMISOS = {
  ADMIN: [
    "home",
    "bitacora",
    "inicio_turno",
    "cierre_turno",
    "historial_bitacora",
    "checklist_camioneta",
    "registro_datos",
    "libro_diario",
    "alertas",
    "usuarios",
    "auditoria_accesos",
    "auditoria_operacional",
    "configuracion",
    "system_health",
    "backups",
    "reportes_ejecutivos",
    "dashboard",
    "pdf",
    "excel",
    "roles"
  ],

  SUPERINTENDENTE: [
    "home",
    "dashboard",
    "alertas",
    "checklist_camioneta",
    "historial_bitacora",
    "reportes_bitacora",
    "reportes_ejecutivos",    "pdf",
    "excel"
  ],

  JEFE_PLANTA: [
    "home",
    "dashboard",
    "alertas",
    "checklist_camioneta",
    "historial_bitacora",
    "reportes_bitacora",
    "reportes_ejecutivos",    "pdf",
    "excel"
  ],

  JEFE_TURNO: [
    "home",
    "dashboard",
    "alertas",
    "checklist_camioneta",
    "historial_bitacora",
    "reportes_bitacora",
    "reportes_ejecutivos",    "pdf",
    "excel"
  ],

  ECM: [
    "home",
    "dashboard",
    "alertas",
    "checklist_camioneta",
    "historial_bitacora",
    "reportes_bitacora",
    "reportes_ejecutivos",    "pdf",
    "excel"
  ],

  OPERADOR_LIDER: [
    "home",
    "alertas",
    "checklist_camioneta"
  ],

  SUPERVISION: [
    "home",
    "dashboard",
    "alertas",
    "checklist_camioneta",
    "historial_bitacora",
    "reportes_bitacora",
    "reportes_ejecutivos",
    "pdf",
    "excel"
  ],

  SUPERVISOR: [
    "home",
    "dashboard",
    "alertas",
    "checklist_camioneta",
    "historial_bitacora",
    "reportes_bitacora",
    "reportes_ejecutivos",
    "pdf",
    "excel"
  ],

  OPERADOR_CALDERA: [
    "home",
    "inicio_turno",
    "bitacora",
    "cierre_turno",
    "historial_propio",
    "historial_bitacora",
    "pdf_bitacora",
    "excel_bitacora"
  ],

  OPERADOR_PLANTA: [
    "home",
    "checklist_camioneta",
    "alertas"
  ],

  OPERADOR: [
    "home",
    "checklist_camioneta",
    "alertas"
  ]
};

const ALIASES_MODULO = {
  bitacora_caldera: "bitacora",
  bitacoras: "historial_bitacora",
  checklist: "bitacora",
  checklist_inicial: "bitacora",
  registro_operacion: "bitacora",
  cierre: "cierre_turno",
  usuarios_admin: "usuarios",
  auditoria: "auditoria_operacional",
  auditoria_login: "auditoria_accesos",
  auditoria_operacional: "auditoria_operacional",
  dashboard_alertas: "alertas",
  checklist_camionetas: "checklist_camioneta",
  bitacoras_diarias: "libro_diario",
  libro_diario_plantas: "libro_diario",
  pdf_caldera: "pdf_bitacora",
  excel_caldera: "excel_bitacora"
};

export const normalizarRol = (rol = "") => String(rol || "").trim().toUpperCase();

export const normalizarModulo = (modulo = "") => {
  const key = String(modulo || "").trim().toLowerCase();
  return ALIASES_MODULO[key] || key;
};

export const permisosPorRol = (rol = "") => PERMISOS[normalizarRol(rol)] || [];

export const tienePermiso = (rol = "", modulo = "") => {
  const rolNormalizado = normalizarRol(rol);
  const moduloNormalizado = normalizarModulo(modulo);
  const permisos = permisosPorRol(rolNormalizado);

  if (rolNormalizado === "ADMIN") return true;
  if (permisos.includes(moduloNormalizado)) return true;

  if (moduloNormalizado === "pdf") {
    return permisos.includes("pdf_bitacora") || permisos.includes("reportes_bitacora") || permisos.includes("reportes_registro_datos") || permisos.includes("reportes_ejecutivos");
  }

  if (moduloNormalizado === "excel") {
    return permisos.includes("excel_bitacora") || permisos.includes("reportes_bitacora") || permisos.includes("reportes_registro_datos") || permisos.includes("reportes_ejecutivos");
  }

  if (moduloNormalizado === "libro_diario") {
    return permisos.includes("libro_diario_reportes");
  }

  if (moduloNormalizado === "registro_datos") {
    return permisos.includes("reportes_registro_datos");
  }

  if (moduloNormalizado === "historial_bitacora") {
    return permisos.includes("bitacora") || permisos.includes("reportes_bitacora");
  }

  return false;
};

export default PERMISOS;

