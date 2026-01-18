const VehiculoModel = require('../models/VehiculoModel');

class VehiculoController {

    static async obtenerEstado(req, res) {
        try {
            const datos = await VehiculoModel.obtener();
            
            if (!datos) {
                // Si no existe, podrías inicializar, pero asumiremos que ya corriste el SQL
                return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
            }

            res.json({ success: true, data: datos });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error servidor' });
        }
    }

    // Guardar Documentos (Se mantiene igual)
    static async guardarDocumentos(req, res) {
        // ... (Tu código actual está bien aquí) ...
        try {
            const { fecha_soat, fecha_revision, fecha_gnv } = req.body;
            await VehiculoModel.actualizarDocumentos(fecha_soat, fecha_revision, fecha_gnv);
            res.json({ success: true, message: "Documentos guardados" });
        } catch(e) { res.status(500).json({success:false}); }
    }

    // Actualizar Kilometraje (Se mantiene igual)
    static async actualizarKilometraje(req, res) {
        // ... (Tu código actual está bien aquí) ...
        try {
            const { nuevo_km } = req.body;
            await VehiculoModel.actualizarOdometro(nuevo_km);
            res.json({ success: true, message: "Tablero actualizado" });
        } catch(e) { res.status(500).json({success:false}); }
    }

    // NUEVO: Registrar mantenimiento de CUALQUIER parte
    static async registrarMantenimientoParte(req, res) {
        try {
            const { id } = req.params; // ID de la parte (ej: 1 para Aceite, 2 para Bujías)
            const { nuevo_km } = req.body; // Kilometraje actual donde se hizo el cambio

            if (!nuevo_km) return res.status(400).json({ success: false });

            // 1. Actualizamos el tablero general primero
            await VehiculoModel.actualizarOdometro(nuevo_km);

            // 2. Reseteamos esa parte específica
            await VehiculoModel.realizarMantenimientoParte(id, nuevo_km);

            res.json({ success: true, message: "Mantenimiento registrado" });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = VehiculoController;