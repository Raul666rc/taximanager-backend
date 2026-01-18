const MetasModel = require('../models/MetasModel');

class MetasController {

    // Obtener el estado de las metas (Wardas con Objetivo)
    static async obtenerEstadoMetas(req, res) {
        try {
            const metas = await MetasModel.obtenerProgreso();
            
            // Calculamos porcentajes aquí para enviar datos listos al frontend
            const reporte = metas.map(m => {
                let porcentaje = (m.ahorrado / m.total) * 100;
                if (porcentaje > 100) porcentaje = 100; // Tope visual
                
                // Cuánto falta
                const restante = m.total - m.ahorrado;

                return {
                    nombre: m.nombre,
                    ahorrado: parseFloat(m.ahorrado),
                    total: parseFloat(m.total),
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

    // NUEVO: Editar Meta
    static async actualizarMeta(req, res) {
        try {
            const { cuenta_id, nuevo_monto } = req.body;

            if (!cuenta_id || !nuevo_monto) {
                return res.status(400).json({ success: false, message: "Datos incompletos" });
            }

            await MetasModel.actualizarMeta(cuenta_id, nuevo_monto);
            
            res.json({ success: true, message: "Meta actualizada correctamente" });

        } catch (error) {
            console.error("Error actualizando meta:", error);
            res.status(500).json({ success: false, message: "Error del servidor" });
        }
    }
}

module.exports = MetasController;