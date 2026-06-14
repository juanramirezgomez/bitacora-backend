import ChecklistCamioneta from "../models/ChecklistCamioneta.js";
import { evaluarAptitud } from "../controllers/checklistCamionetaController.js";

const camposAptitud = [
  "aptitudOperacion",
  "aptaOperacion",
  "motivoNoApta",
  "alertaDetonante",
  "prioridadDetonante",
  "categoriaDetonante"
];

const valorComparable = (value) => value ?? "";

const tieneDiferencias = (checklist, evaluacion) =>
  camposAptitud.some((campo) => valorComparable(checklist[campo]) !== valorComparable(evaluacion[campo]));

const motivoDiferencia = (checklist, evaluacion) => {
  if (checklist.aptitudOperacion === "NO_APTA" && evaluacion.aptitudOperacion === "APTA") {
    return "NO_APTA historica sin condicion critica vigente en el checklist.";
  }
  if (checklist.aptitudOperacion === "APTA" && evaluacion.aptitudOperacion === "NO_APTA") {
    return evaluacion.motivoNoApta || "Condicion critica detectada por las reglas actuales.";
  }
  if (checklist.aptaOperacion !== evaluacion.aptaOperacion) {
    return "Inconsistencia entre aptitudOperacion y aptaOperacion almacenadas.";
  }
  return "Metadatos de aptitud desactualizados.";
};

const mapReporte = (checklist, evaluacion) => ({
  checklistId: String(checklist._id),
  patente: checklist.patente || "-",
  fecha: checklist.fechaInspeccion || checklist.fechaCreacion || checklist.createdAt || null,
  aptitudGuardada: checklist.aptitudOperacion || (checklist.aptaOperacion === false ? "NO_APTA" : "APTA"),
  aptaOperacionGuardada: checklist.aptaOperacion !== false,
  aptitudRecalculada: evaluacion.aptitudOperacion,
  aptaOperacionRecalculada: evaluacion.aptaOperacion,
  motivo: motivoDiferencia(checklist, evaluacion),
  motivoNoAptaGuardado: checklist.motivoNoApta || "",
  motivoNoAptaRecalculado: evaluacion.motivoNoApta,
  alertaDetonante: evaluacion.alertaDetonante,
  prioridadDetonante: evaluacion.prioridadDetonante,
  categoriaDetonante: evaluacion.categoriaDetonante
});

export const auditarAptitudChecklists = async ({ actualizar = false } = {}) => {
  const checklists = await ChecklistCamioneta.find({})
    .sort({ fechaInspeccion: -1, createdAt: -1 });

  const reporte = [];
  const analisis = [];
  const operaciones = [];

  for (const checklist of checklists) {
    const evaluacion = evaluarAptitud(checklist);
    const diferencia = tieneDiferencias(checklist, evaluacion);
    analisis.push({
      checklistId: String(checklist._id),
      fecha: checklist.fechaInspeccion || checklist.fechaCreacion || checklist.createdAt || null,
      patente: checklist.patente || "-",
      aptitudOperacionAlmacenada: checklist.aptitudOperacion || (checklist.aptaOperacion === false ? "NO_APTA" : "APTA"),
      aptaOperacionAlmacenada: checklist.aptaOperacion !== false,
      resultadoActualCalculado: evaluacion.aptitudOperacion,
      aptaOperacionCalculada: evaluacion.aptaOperacion,
      tieneDiferencia: diferencia,
      motivo: diferencia ? motivoDiferencia(checklist, evaluacion) : evaluacion.motivoNoApta
    });
    if (!diferencia) continue;

    reporte.push(mapReporte(checklist, evaluacion));
    if (actualizar) {
      operaciones.push({
        updateOne: {
          filter: { _id: checklist._id },
          update: { $set: evaluacion }
        }
      });
    }
  }

  if (actualizar && operaciones.length) {
    await ChecklistCamioneta.bulkWrite(operaciones, { ordered: false });
  }

  return {
    totalAnalizados: checklists.length,
    totalCorregidos: actualizar ? reporte.length : 0,
    totalConDiferencias: reporte.length,
    totalSinCambios: checklists.length - reporte.length,
    modo: actualizar ? "CORRECCION" : "DIAGNOSTICO",
    analisis,
    reporte
  };
};
