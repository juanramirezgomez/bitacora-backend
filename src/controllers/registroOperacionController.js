import mongoose from "mongoose";
import RegistroOperacion from "../models/RegistroOperacion.js";
import Bitacora from "../models/Bitacora.js";

/* =====================================================
   CREAR REGISTRO
===================================================== */
export const crearRegistroOperacion = async (req, res) => {
  try {
    const { bitacoraId } = req.params;
    const { hora, parametros, purgaDeFondo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bitacoraId)) {
      return res.status(400).json({ message: "bitacoraId inválido" });
    }

    const objectId = new mongoose.Types.ObjectId(bitacoraId);

    if (!hora) {
      return res.status(400).json({ message: "La hora es obligatoria" });
    }

    if (!Array.isArray(parametros) || parametros.length === 0) {
      return res.status(400).json({ message: "Debe enviar parámetros válidos" });
    }

    for (const p of parametros) {
      if (!p.label || !p.unidad || p.value === undefined || p.value === null) {
        return res.status(400).json({
          message: "Parámetro inválido",
          parametro: p
        });
      }

      if (typeof p.value !== "number") {
        return res.status(400).json({
          message: `El valor de ${p.label} debe ser numérico`
        });
      }
    }

    const bitacora = await Bitacora.findById(objectId);
    if (!bitacora) {
      return res.status(404).json({ message: "Bitácora no encontrada" });
    }

    if (bitacora.estado !== "ABIERTA") {
      return res.status(400).json({
        message: "No se pueden agregar registros a una bitácora cerrada"
      });
    }

    const existeHora = await RegistroOperacion.findOne({
      bitacoraId: objectId,
      hora
    });

    if (existeHora) {
      return res.status(409).json({
        message: `Ya existe un registro para la hora ${hora}`
      });
    }

    const nuevo = await RegistroOperacion.create({
      bitacoraId: objectId,
      hora,
      parametros,
      purgaDeFondo: purgaDeFondo || "NO"
    });

    return res.status(201).json(nuevo);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error creando registro de operación"
    });
  }
};

/* =====================================================
   LISTAR REGISTROS
===================================================== */
export const listarRegistroOperacion = async (req, res) => {
  try {
    const { bitacoraId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bitacoraId)) {
      return res.status(400).json({ message: "bitacoraId inválido" });
    }

    const objectId = new mongoose.Types.ObjectId(bitacoraId);

    const registros = await RegistroOperacion
      .find({ bitacoraId: objectId })
      .sort({ createdAt: -1 });

    return res.json(registros);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error listando registros"
    });
  }
};

/* =====================================================
   EDITAR REGISTRO
===================================================== */
export const editarRegistroOperacion = async (req, res) => {
  try {
    const { bitacoraId, id } = req.params;
    const objectId = new mongoose.Types.ObjectId(bitacoraId);

    const registro = await RegistroOperacion.findOne({
      _id: id,
      bitacoraId: objectId
    });

    if (!registro) {
      return res.status(404).json({
        message: "Registro no encontrado"
      });
    }

    const { hora, parametros, purgaDeFondo } = req.body;

    if (hora) registro.hora = hora;
    if (Array.isArray(parametros)) registro.parametros = parametros;
    if (purgaDeFondo) registro.purgaDeFondo = purgaDeFondo;

    await registro.save();

    return res.json(registro);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error actualizando registro"
    });
  }
};

/* =====================================================
   ELIMINAR REGISTRO
===================================================== */
export const eliminarRegistroOperacion = async (req, res) => {
  try {
    const { bitacoraId, id } = req.params;
    const objectId = new mongoose.Types.ObjectId(bitacoraId);

    const eliminado = await RegistroOperacion.findOneAndDelete({
      _id: id,
      bitacoraId: objectId
    });

    if (!eliminado) {
      return res.status(404).json({
        message: "Registro no encontrado"
      });
    }

    return res.json({ message: "Registro eliminado correctamente" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error eliminando registro"
    });
  }
};
