// UBICACIÓN: src/controllers/VehiculoController.js
const VehiculoModel = require('../models/VehiculoModel');

class VehiculoController {

    // GET: Obtener estado para la barra de vida
    static async obtenerEstado(req, res) {
        try {
            const auto = await VehiculoModel.obtener();

            if (!auto) {
                // Si no existe, lo creamos al vuelo con valores por defecto
                await VehiculoModel.inicializar(100000, 105000);
                return res.json({ success: true, message: 'Vehículo inicializado. Refresca.' });
            }

            // --- LÓGICA DE NEGOCIO ---
            const recorrido = auto.odometro_actual;
            const meta = auto.proximo_cambio_aceite;
            const restante = meta - recorrido;

            // Calculamos porcentaje de vida (Asumiendo intervalo de 5000km para la barra visual)
            const intervaloVisual = 5000; 
            let porcentajeVida = (restante / intervaloVisual) * 100;

            // Limites visuales
            if (porcentajeVida > 100) porcentajeVida = 100;
            if (porcentajeVida < 0) porcentajeVida = 0;

            res.json({
                success: true,
                data: {
                    odometro: recorrido,
                    proximo_cambio: meta,
                    km_restantes: restante,
                    porcentaje_vida: porcentajeVida
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al obtener vehículo' });
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