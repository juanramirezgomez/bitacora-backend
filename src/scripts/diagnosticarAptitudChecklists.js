import "dotenv/config";
import mongoose from "mongoose";
import { auditarAptitudChecklists } from "../services/checklistAptitudAuditService.js";

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!mongoUri) {
  throw new Error("No se encontro MONGODB_URI, MONGO_URI o DATABASE_URL.");
}

try {
  await mongoose.connect(mongoUri);
  const resultado = await auditarAptitudChecklists();

  console.log("\nAUDITORIA APTITUD CHECKLIST CAMIONETAS");
  console.log(`Total checklist analizados: ${resultado.totalAnalizados}`);
  console.log(`Total con diferencias: ${resultado.totalConDiferencias}`);
  console.log(`Total sin cambios: ${resultado.totalSinCambios}\n`);

  console.log("RESULTADO POR CHECKLIST");
  console.table(resultado.analisis.map((item) => ({
    checklistId: item.checklistId,
    fecha: item.fecha ? new Date(item.fecha).toISOString() : "-",
    patente: item.patente,
    aptitudOperacionAlmacenada: item.aptitudOperacionAlmacenada,
    aptaOperacionAlmacenada: item.aptaOperacionAlmacenada,
    resultadoActualCalculado: item.resultadoActualCalculado,
    diferencia: item.tieneDiferencia
  })));

  if (resultado.reporte.length) {
    console.log("DIFERENCIAS DETECTADAS");
    console.table(resultado.reporte.map((item) => ({
      checklistId: item.checklistId,
      patente: item.patente,
      fecha: item.fecha ? new Date(item.fecha).toISOString() : "-",
      aptitudGuardada: item.aptitudGuardada,
      aptitudRecalculada: item.aptitudRecalculada,
      motivo: item.motivo
    })));
  }

  console.log(JSON.stringify(resultado, null, 2));
} finally {
  await mongoose.disconnect();
}
