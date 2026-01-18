// UBICACIÓN: src/controllers/VehiculoController.js
const VehiculoModel = require('../models/VehiculoModel');

class VehiculoController {

    // MODIFICADO: Ahora devuelve también las fechas de documentos
    static async obtenerEstado(req, res) {
        try {
            const auto = await VehiculoModel.obtener();

            if (!auto) {
                await VehiculoModel.inicializar(100000, 105000);
                return res.json({ success: true, message: 'Vehículo inicializado.' });
            }

            // Cálculos mecánicos (Igual que antes)
            const recorrido = auto.odometro_actual;
            const meta = auto.proximo_cambio_aceite;
            const restante = meta - recorrido;
            const intervaloVisual = 5000; 
            let porcentajeVida = (restante / intervaloVisual) * 100;

            if (porcentajeVida > 100) porcentajeVida = 100;
            if (porcentajeVida < 0) porcentajeVida = 0;

            res.json({
                success: true,
                data: {
                    odometro: recorrido,
                    proximo_cambio: meta,
                    km_restantes: restante,
                    porcentaje_vida: porcentajeVida,
                    // NUEVO: Enviamos las fechas
                    fecha_soat: auto.fecha_soat,
                    fecha_revision: auto.fecha_revision,
                    fecha_gnv: auto.fecha_gnv
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al obtener vehículo' });
        }
    }
    // NUEVO: Función para guardar las fechas desde el modal
    static async guardarDocumentos(req, res) {
        try {
            const { fecha_soat, fecha_revision, fecha_gnv } = req.body;
            
            await VehiculoModel.actualizarDocumentos(fecha_soat, fecha_revision, fecha_gnv);

            res.json({ success: true, message: "Documentos actualizados correctamente" });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, message: "Error al guardar documentos" });
        }
    }

    // POST: Actualizar Tablero (Lectura manual)
    static async actualizarKilometraje(req, res) {
        try {
            const { nuevo_km } = req.body;
            
            if (!nuevo_km) return res.status(400).json({ success: false, message: 'Falta kilometraje' });

            // 1. Validar lógica (No se puede retroceder el tiempo)
            const actualAuto = await VehiculoModel.obtener();
            const kmActual = actualAuto ? actualAuto.odometro_actual : 0;

            if (nuevo_km < kmActual) {
                return res.status(400).json({ 
                    success: false, 
                    message: `⚠️ Error: El kilometraje nuevo (${nuevo_km}) no puede ser menor al actual (${kmActual}).` 
                });
            }

            // 2. Guardar en BD usando el Modelo
            await VehiculoModel.actualizarOdometro(nuevo_km);

            // 3. Calcular cuánto se recorrió hoy
            const diferencia = nuevo_km - kmActual;

            res.json({ 
                success: true, 
                message: 'Tablero actualizado', 
                recorrido_hoy: diferencia 
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al actualizar' });
        }
    }

    // POST: Registrar Mantenimiento (Actualiza Km Y Resetea Aceite)
    static async registrarCambioAceite(req, res) {
        try {
            // Recibimos DOS datos: El intervalo (5000) y el Km exacto de hoy
            const { intervalo_km, nuevo_km } = req.body; 
            
            if (!nuevo_km) return res.status(400).json({ success: false, message: 'Falta el kilometraje actual' });

            const intervalo = intervalo_km || 5000; // Por defecto 5000

            // 1. PRIMERO: Actualizamos el tablero con el dato fresco (Usamos el Modelo existente)
            await VehiculoModel.actualizarOdometro(nuevo_km);

            // 2. SEGUNDO: Calculamos la nueva meta basándonos en ese dato fresco
            // Meta = Kilometraje HOY + 5000
            const nuevaMeta = parseInt(nuevo_km) + parseInt(intervalo);

            // 3. TERCERO: Guardamos la nueva meta
            await VehiculoModel.actualizarProximoCambio(nuevaMeta);

            res.json({ 
                success: true, 
                message: `¡Mantenimiento Listo! Aceite nuevo al Km ${nuevo_km}. Próximo cambio: ${nuevaMeta} km.` 
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = VehiculoController;