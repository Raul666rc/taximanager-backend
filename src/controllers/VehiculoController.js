const VehiculoModel = require('../models/VehiculoModel');

class VehiculoController {

    // GET: Obtener todo
    static async obtenerEstado(req, res) {
        try {
            const datos = await VehiculoModel.obtener();

            if (!datos) {
                await VehiculoModel.inicializar(100000, 105000);
                return res.json({ success: true, message: 'Inicializando...' });
            }

            // Cálculos para la barra principal (Aceite dashboard)
            const recorrido = datos.odometro_actual;
            const meta = datos.proximo_cambio_aceite;
            const restante = meta - recorrido;
            const intervaloVisual = 5000; 
            let porcentajeVida = (restante / intervaloVisual) * 100;
            if (porcentajeVida > 100) porcentajeVida = 100;
            if (porcentajeVida < 0) porcentajeVida = 0;

            // Enviamos TODO al frontend
            res.json({
                success: true,
                data: {
                    // Datos Dashboard (Tu código actual usa esto)
                    odometro: recorrido,
                    proximo_cambio: meta,
                    km_restantes: restante,
                    porcentaje_vida: porcentajeVida,
                    fecha_soat: datos.fecha_soat,
                    fecha_revision: datos.fecha_revision,
                    fecha_gnv: datos.fecha_gnv,
                    
                    // NUEVO: La lista detallada para el modal
                    partes: datos.partes 
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error servidor' });
        }
    }

    // POST: Cambio de Aceite Principal (Sincronizado)
    static async registrarCambioAceite(req, res) {
        try {
            const { intervalo_km, nuevo_km } = req.body; 
            
            if (!nuevo_km) return res.status(400).json({ success: false, message: 'Falta km' });

            const intervalo = parseInt(intervalo_km) || 5000;
            const nuevaMeta = parseInt(nuevo_km) + intervalo;

            // 1. Actualizar Odómetro
            await VehiculoModel.actualizarOdometro(nuevo_km);

            // 2. Actualizar Meta Aceite (En ambas tablas gracias al modelo)
            await VehiculoModel.actualizarProximoCambioAceite(nuevaMeta, nuevo_km, intervalo);

            res.json({ success: true, message: `¡Aceite Cambiado! Próximo: ${nuevaMeta} km.` });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // NUEVO: Resetear una parte específica (Caja, GLP, etc.)
    static async registrarMantenimientoParte(req, res) {
        try {
            const { id } = req.params; 
            const { nuevo_km } = req.body;

            // Actualizamos odómetro general
            await VehiculoModel.actualizarOdometro(nuevo_km);
            // Reseteamos la parte
            await VehiculoModel.realizarMantenimientoParte(id, nuevo_km);

            res.json({ success: true, message: "Mantenimiento registrado" });
        } catch (error) {
            res.status(500).json({ success: false, message: "Error" });
        }
    }

    // Las otras funciones (guardarDocumentos, actualizarKilometraje) déjalas IGUAL que antes.
    static async guardarDocumentos(req, res) {
        try {
            const { fecha_soat, fecha_revision, fecha_gnv } = req.body;
            await VehiculoModel.actualizarDocumentos(fecha_soat, fecha_revision, fecha_gnv);
            res.json({ success: true, message: "Documentos actualizados" });
        } catch (e) { res.status(500).json({ success: false }); }
    }

    static async actualizarKilometraje(req, res) {
        try {
            const { nuevo_km } = req.body;
            await VehiculoModel.actualizarOdometro(nuevo_km);
            const actual = await VehiculoModel.obtener();
            const diferencia = nuevo_km - (actual.odometro_actual || 0); // Aproximado
            res.json({ success: true, message: 'Tablero actualizado', recorrido_hoy: diferencia });
        } catch (e) { res.status(500).json({ success: false }); }
    }
}

module.exports = VehiculoController;