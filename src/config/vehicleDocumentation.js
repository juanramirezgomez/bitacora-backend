const VEHICLE_DOCUMENTATION = {
  "SWJJ-86": {
    planta: "PC1",
    documentacion: {
      "PERMISO DE CIRCULACION": "2026-08-31",
      "REVISION TECNICA": "2027-09-27",
      "CERTIFICACION INTERNA": "2026-09-04",
      "SEGURO OBLIGATORIO": "2027-03-31"
    }
  }
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

export const normalizePatente = (value) => normalizeText(value).replace(/\s+/g, "");

export const getVehicleDocumentation = (patente) => {
  const config = VEHICLE_DOCUMENTATION[normalizePatente(patente)];
  if (!config) return null;

  return {
    patente: normalizePatente(patente),
    planta: config.planta,
    documentacion: Object.entries(config.documentacion).map(([nombre, fechaVencimiento]) => ({
      nombre,
      fechaVencimiento,
      estado: "VIGENTE",
      automatico: true
    }))
  };
};

export const applyVehicleDocumentation = (documentacion = [], patente = "") => {
  const config = getVehicleDocumentation(patente);
  if (!config) return documentacion;

  const automaticos = new Map(config.documentacion.map((doc) => [normalizeText(doc.nombre), doc]));
  return (Array.isArray(documentacion) ? documentacion : []).map((doc) => {
    const automatico = automaticos.get(normalizeText(doc.nombre));
    if (!automatico) return doc;
    return {
      ...doc,
      fechaVencimiento: automatico.fechaVencimiento,
      estado: "VIGENTE"
    };
  });
};

export const listVehicleDocumentation = () =>
  Object.keys(VEHICLE_DOCUMENTATION).map((patente) => getVehicleDocumentation(patente));
