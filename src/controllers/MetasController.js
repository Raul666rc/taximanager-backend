const MetasModel = require('../models/MetasModel');

class MetasController {

    // Obtener estado (Se mantiene casi igual, solo aseguramos números)
    static async obtenerEstadoMetas(req, res) {
        try {
            const metas = await MetasModel.obtenerProgreso();
            
            const reporte = metas.map(m => {
                // Validación para evitar división por cero
                const total = parseFloat(m.total);
                const ahorrado = parseFloat(m.ahorrado);
                
                let porcentaje = 0;
                if (total > 0) {
                    porcentaje = (ahorrado / total) * 100;
                } else if (ahorrado > 0) {
                    porcentaje = 100; // Si hay ahorro y meta es 0, es 100%
                }

                if (porcentaje > 100) porcentaje = 100;

                const restante = total - ahorrado;

                return {
                    id: m.id, // Aseguramos enviar el ID para el botón de editar
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
            console.log("📥 Recibiendo en Controller:", req.body); // Para depurar

            const { cuenta_id, nuevo_monto } = req.body;

            // Validación mejorada: permitimos que el monto sea 0, pero no undefined
            if (!cuenta_id || nuevo_monto === undefined || nuevo_monto === null) {
                return res.status(400).json({ success: false, message: "Datos incompletos: falta ID o Monto" });
            }

            await MetasModel.actualizarMeta(cuenta_id, nuevo_monto);
            
            res.json({ success: true, message: "Meta actualizada correctamente" });

        } catch (error) {
            console.error("Error actualizando meta:", error);
            res.status(500).json({ success: false, message: "Error del servidor al guardar meta" });
        }
    }
}

module.exports = MetasController;