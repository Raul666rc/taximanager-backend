const MetasModel = require('../models/MetasModel');

class MetasController {

    // Obtener estado de metas
    static async obtenerEstadoMetas(req, res) {
        try {
            const metas = await MetasModel.obtenerProgreso();
            
            const reporte = metas.map(m => {
                const total = parseFloat(m.total);
                const ahorrado = parseFloat(m.ahorrado);
                
                // Evitar división por cero visual
                let porcentaje = 0;
                if (total > 0) porcentaje = (ahorrado / total) * 100;
                if (porcentaje > 100) porcentaje = 100;

                const restante = total - ahorrado;

                return {
                    id: m.id,      // ID de la cuenta para editar
                    nombre: m.nombre,
                    ahorrado: ahorrado,
                    total: total,
                    restante: restante > 0 ? restante : 0,
                    porcentaje: parseFloat(porcentaje.toFixed(1))
                };
            });

            res.json({ success: true, data: reporte });
        } catch (error) {
            console.error("Error en MetasController:", error);
            res.status(500).json({ success: false, message: "Error calculando metas" });
        }
    }

    // EDITAR META (CORREGIDO)
    static async actualizarMeta(req, res) {
        try {
            const { cuenta_id, nuevo_monto } = req.body;

            // Validación básica
            if (!cuenta_id || nuevo_monto === undefined) {
                return res.status(400).json({ success: false, message: "Datos incompletos" });
            }

            // Ejecutamos la actualización
            const result = await MetasModel.actualizarMeta(cuenta_id, nuevo_monto);

            // Verificamos si la base de datos encontró la fila
            if (result.affectedRows === 0) {
                // Si entra aquí, es porque intentaste editar una cuenta que NO tiene meta registrada en la tabla 'metas_cuentas'.
                // Como dijiste "no crear más metas", esto es un error para el usuario.
                return res.status(404).json({ success: false, message: "Esta cuenta no tiene una meta configurada para editar." });
            }
            
            res.json({ success: true, message: "Meta actualizada correctamente" });

        } catch (error) {
            console.error("Error actualizando meta:", error);
            res.status(500).json({ success: false, message: "Error del servidor" });
        }
    }
}

module.exports = MetasController;