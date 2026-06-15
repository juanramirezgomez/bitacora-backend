import "dotenv/config";
import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!mongoUri) {
  throw new Error("No se encontro MONGODB_URI, MONGO_URI o DATABASE_URL.");
}

const MAPA_ESTADOS = {
  ASIGNADA: "EN_GESTION",
  EN_PROCESO: "EN_GESTION",
  RESUELTA: "CERRADA"
};

try {
  await mongoose.connect(mongoUri);
  const alertas = mongoose.connection.collection("alertacamionetas");
  const seguimientos = mongoose.connection.collection("alertaseguimientos");
  const existentes = await alertas.find({ estado: { $in: Object.keys(MAPA_ESTADOS) } }).toArray();
  const ahora = new Date();

  if (existentes.length) {
    await alertas.bulkWrite(existentes.map((alerta) => {
      const estadoNuevo = MAPA_ESTADOS[alerta.estado];
      const fechaBase = alerta.fechaUltimoMovimiento || alerta.updatedAt || ahora;
      const $set = {
        estado: estadoNuevo,
        fechaUltimoMovimiento: ahora,
        updatedAt: ahora
      };

      if (estadoNuevo === "EN_GESTION") {
        $set.fechaInicioGestion = alerta.fechaInicioGestion || alerta.fechaAsignacion || fechaBase;
      } else {
        $set.fechaCierre = alerta.fechaCierre || alerta.fechaResolucion || fechaBase;
        $set.comentarioCierre = alerta.comentarioCierre || alerta.solucion || alerta.accionCorrectiva ||
          "Cierre generado por migracion automatica del flujo de alertas.";
      }

      return { updateOne: { filter: { _id: alerta._id }, update: { $set } } };
    }), { ordered: false });

    await seguimientos.insertMany(existentes.map((alerta) => ({
      alertaId: alerta._id,
      usuarioId: null,
      nombreUsuario: "Sistema",
      rol: "SISTEMA",
      comentario: `Migracion automatica de estado ${alerta.estado} a ${MAPA_ESTADOS[alerta.estado]}.`,
      tipoEvento: "CAMBIO_ESTADO",
      estadoAnterior: alerta.estado,
      estadoNuevo: MAPA_ESTADOS[alerta.estado],
      evidencias: [],
      fecha: ahora,
      createdAt: ahora,
      updatedAt: ahora
    })), { ordered: false });
  }

  const resumen = {
    totalMigrados: existentes.length,
    asignadaAEnGestion: existentes.filter((item) => item.estado === "ASIGNADA").length,
    enProcesoAEnGestion: existentes.filter((item) => item.estado === "EN_PROCESO").length,
    resueltaACerrada: existentes.filter((item) => item.estado === "RESUELTA").length
  };
  console.log("MIGRACION ESTADOS ALERTAS COMPLETADA");
  console.table(resumen);
} finally {
  await mongoose.disconnect();
}
