import Bitacora from "../models/Bitacora.js";
import ChecklistInicial from "../models/ChecklistInicial.js";
import RegistroOperacion from "../models/RegistroOperacion.js";

const parseHoraToMinutes = (hhmm) => {
  if (!hhmm) return null;
  const s = String(hhmm).trim();
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
};

const statsFromField = (rows, field) => {
  const nums = rows
    .map((r) => r?.[field])
    .filter((v) => typeof v === "number" && Number.isFinite(v));

  if (nums.length === 0) return { count: 0, min: null, max: null, avg: null };

  const min = nums.reduce((a, b) => (b < a ? b : a), nums[0]);
  const max = nums.reduce((a, b) => (b > a ? b : a), nums[0]);
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;

  return { count: nums.length, min, max, avg };
};

const deltaTotalizador = (rows, field) => {
  const primero = rows.find((r) => typeof r?.[field] === "number" && Number.isFinite(r[field]));
  const ultimo = [...rows].reverse().find((r) => typeof r?.[field] === "number" && Number.isFinite(r[field]));
  if (!primero || !ultimo) return null;

  const d = ultimo[field] - primero[field];
  return Number.isFinite(d) ? d : null;
};

const calcularDuracionHoras = (rows) => {
  if (!rows || rows.length < 2) return null;

  const firstMin = parseHoraToMinutes(rows[0]?.hora);
  const lastMin = parseHoraToMinutes(rows[rows.length - 1]?.hora);

  if (firstMin === null || lastMin === null) return null;

  let diffMin = lastMin - firstMin;

  // Si cruzó medianoche (ej 23:30 -> 01:00)
  if (diffMin < 0) diffMin += 24 * 60;

  return diffMin / 60;
};

export const obtenerDetalleBitacora = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    const bitacora = await Bitacora.findById(bitacoraId);
    if (!bitacora) return res.status(404).json({ message: "Bitácora no encontrada" });

    const [checklistInicial, registrosOperacion] = await Promise.all([
      ChecklistInicial.findOne({ bitacoraId }),
      RegistroOperacion.find({ bitacoraId }).sort({ hora: 1 })
    ]);

    const duracionHoras = calcularDuracionHoras(registrosOperacion);

    // Deltas de totalizadores
    const deltaBombaSalidaDesairador = deltaTotalizador(registrosOperacion, "totalizadorBombaSalidaDesairador");
    const deltaIngresoAguaTk28 = deltaTotalizador(registrosOperacion, "totalizadorIngresoAguaTk28");

    // ✅ Consumo caldera oficial: por totalizador bomba salida a desairador
    const consumoCalderaM3 = deltaBombaSalidaDesairador;
    const consumoCalderaM3H =
      duracionHoras && consumoCalderaM3 !== null && Number.isFinite(consumoCalderaM3)
        ? consumoCalderaM3 / duracionHoras
        : null;

    // Estadísticas
    const presionStats = statsFromField(registrosOperacion, "presionCalderaBar");
    const vaporStats = statsFromField(registrosOperacion, "vaporTH");
    const tempGasesStats = statsFromField(registrosOperacion, "temperaturaGasesChimenea");
    const nivelTkStats = statsFromField(registrosOperacion, "nivelTkCombustiblePct");
    const consumoCombStats = statsFromField(registrosOperacion, "consumoCombustibleM3H");
    const flujoB41Stats = statsFromField(registrosOperacion, "flujoBomba41M3H");
    const tempITCStats = statsFromField(registrosOperacion, "temperaturaSalidaITC");

    // Estimaciones por duración
    const consumoCombustibleTotalM3 =
      duracionHoras && Number.isFinite(consumoCombStats.avg) ? consumoCombStats.avg * duracionHoras : null;

    const vaporTotalTonEstimado =
      duracionHoras && Number.isFinite(vaporStats.avg) ? vaporStats.avg * duracionHoras : null;

    const resumen = {
      totalRegistros: registrosOperacion.length,
      horaPrimera: registrosOperacion[0]?.hora || null,
      horaUltima: registrosOperacion[registrosOperacion.length - 1]?.hora || null,
      duracionHoras: duracionHoras,

      presionCalderaBar: presionStats,
      vaporTH: vaporStats,
      temperaturaGasesChimenea: tempGasesStats,
      nivelTkCombustiblePct: nivelTkStats,
      consumoCombustibleM3H: consumoCombStats,
      flujoBomba41M3H: flujoB41Stats,
      temperaturaSalidaITC: tempITCStats,

      // ✅ Deltas (para trazabilidad)
      deltaTotalizadorBombaSalidaDesairador: deltaBombaSalidaDesairador,
      deltaTotalizadorIngresoAguaTk28: deltaIngresoAguaTk28,

      // ✅ Consumo caldera oficial
      consumoCalderaM3,
      consumoCalderaM3H,

      // ✅ Estimaciones
      estimaciones: {
        consumoCombustibleTotalM3,
        vaporTotalTonEstimado
      }
    };

    return res.json({
      bitacora,
      checklistInicial: checklistInicial || null,
      registrosOperacion,
      resumen
    });
  } catch (error) {
    return res.status(500).json({ message: "Error obteniendo detalle de bitácora" });
  }
};
