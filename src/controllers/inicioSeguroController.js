import InicioSeguroTurno from "../models/InicioSeguroTurno.js";
import User from "../models/user.js";

const chileDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour || 0);
  return {
    fechaTurno: `${map.year}-${map.month}-${map.day}`,
    hora: `${map.hour}:${map.minute}`,
    turno: hour >= 8 && hour < 20 ? "DIA" : "NOCHE"
  };
};

const alertaPreventiva = (respuestas = {}) => {
  const estado = String(respuestas.estadoAnimo || "").toUpperCase();
  const descanso = String(respuestas.descanso || "").toUpperCase();
  const fisica = String(respuestas.condicionFisica || "").toUpperCase();
  return estado === "FATIGADO" || descanso === "NO" || fisica === "NO";
};

export const estadoInicioSeguro = async (req, res) => {
  try {
    const user = await User.findById(req.user?.uid).select("_id nombre operadorId rol planta");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const turnoActual = chileDateParts();
    const registro = await InicioSeguroTurno.findOne({
      operador: user._id,
      turno: turnoActual.turno,
      fechaTurno: turnoActual.fechaTurno
    }).lean();

    return res.json({
      requiereInicioSeguro: !registro,
      turnoActual,
      registro,
      operador: {
        nombre: user.nombre,
        operadorId: user.operadorId || "",
        rol: user.rol,
        planta: user.planta || "PC1"
      }
    });
  } catch (error) {
    console.error("Error estado inicio seguro", error);
    return res.status(500).json({ message: "Error obteniendo inicio seguro" });
  }
};

export const registrarInicioSeguro = async (req, res) => {
  try {
    const user = await User.findById(req.user?.uid).select("_id nombre operadorId rol planta");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const respuestas = req.body?.respuestas || {};
    const confirmaApto = req.body?.confirmaApto === true;

    if (!confirmaApto) {
      return res.status(400).json({ message: "Debes confirmar que te encuentras apto para operar" });
    }

    for (const key of ["estadoAnimo", "descanso", "condicionFisica", "concentracionMental"]) {
      if (!respuestas[key]) return res.status(400).json({ message: "Debes responder todas las preguntas preventivas" });
    }

    const turnoActual = chileDateParts();
    const alerta = alertaPreventiva(respuestas);
    const operadorId = user.operadorId || "SINID";

    const registro = await InicioSeguroTurno.findOneAndUpdate(
      {
        operador: user._id,
        turno: turnoActual.turno,
        fechaTurno: turnoActual.fechaTurno
      },
      {
        operador: user._id,
        operadorNombre: user.nombre,
        operadorId,
        rol: user.rol,
        planta: user.planta || "PC1",
        turno: turnoActual.turno,
        fechaTurno: turnoActual.fechaTurno,
        fecha: new Date(),
        respuestas,
        confirmaApto,
        alertaPreventiva: alerta
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      message: "Inicio seguro de turno registrado",
      alertaPreventiva: alerta,
      registro
    });
  } catch (error) {
    console.error("Error registrando inicio seguro", error);
    return res.status(500).json({ message: "Error registrando inicio seguro" });
  }
};
