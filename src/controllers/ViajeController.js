// UBICACIÓN: src/controllers/ViajeController.js
const ViajeModel = require('../models/ViajeModel');
const TransaccionModel = require('../models/TransaccionModel');

class ViajeController {

    // Acción: Iniciar Carrera
    static async iniciarCarrera(req, res) {
        try {
            // Recibimos datos del frontend (celular)
            const { origen_tipo, lat, lng } = req.body;

            // Validación básica
            if (!origen_tipo) {
                return res.status(400).json({ success: false, message: 'Falta el tipo de origen' });
            }

            // 1. Llamamos al Modelo para crear viaje
            const idViaje = await ViajeModel.iniciar(origen_tipo);

            // 2. Guardamos el punto GPS inicial
            if (lat && lng) {
                await ViajeModel.guardarRastro(idViaje, lat, lng, 'INICIO');
            }

            // Respondemos éxito
            res.json({
                success: true,
                message: 'Carrera iniciada',
                data: { id_viaje: idViaje }
            });

        } catch (error) {
            console.error('Error al iniciar:', error);
            res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
    }

    // Acción: Registrar una Parada Intermedia (o Rastro GPS)
    static async registrarParada(req, res) {
        try {
            const { id_viaje, lat, lng, tipo } = req.body; 
            // 'tipo' puede ser 'PARADA' (botón) o 'RASTRO' (automático cada min)

            // Validar datos básicos
            if (!id_viaje || !lat || !lng) {
                return res.status(400).json({ success: false, message: 'Faltan coordenadas o ID de viaje' });
            }

            // Usamos el método que ya teníamos en el Modelo
            // Por defecto, si no envías tipo, asumimos que es una 'PARADA' manual
            const tipoPunto = tipo || 'PARADA'; 
            
            await ViajeModel.guardarRastro(id_viaje, lat, lng, tipoPunto);

            res.json({ success: true, message: 'Punto registrado correctamente' });

        } catch (error) {
            console.error('Error al registrar punto:', error);
            res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
    }

    // Acción: Terminar Carrera
    static async terminarCarrera(req, res) {
        try {
            const { id_viaje, monto, metodo_pago_id, lat, lng } = req.body;

            // Validaciones
            if(!id_viaje || !monto || !metodo_pago_id) {
                return res.status(400).json({ success: false, message: 'Faltan datos de cobro' });
            }

            // 1. Cerrar el viaje en BD (Estado 'COMPLETADO')
            await ViajeModel.finalizar(id_viaje, monto, metodo_pago_id);

            // 2. Guardar punto GPS final
            if (lat && lng) {
                await ViajeModel.guardarRastro(id_viaje, lat, lng, 'FIN');
            }

            // 3. ¡LA MAGIA! Distribuir el dinero (10-10-80)
            // Esto actualiza tus saldos y crea el registro financiero
            await TransaccionModel.distribuirIngresoTaxi(id_viaje, monto, metodo_pago_id);

            res.json({ 
                success: true, 
                message: 'Carrera finalizada. Dinero distribuido y saldo actualizado.' 
            });

        } catch (error) {
            console.error('Error al terminar:', error);
            res.status(500).json({ success: false, message: 'Error al procesar el cierre del viaje' });
        }
    }

    static async obtenerResumen(req, res) {
        try {
            const total = await ViajeModel.obtenerTotalDia();
            res.json({ success: true, total: total });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al calcular total' });
        }
    }

    // Acción: Registrar un Gasto (Gasolina, Mantenimiento, Comida)
    static async registrarGasto(req, res) {
        try {
            const { monto, descripcion, cuenta_id } = req.body;
            // cuenta_id: 1=Efectivo, 2=Yape (de dónde salió la plata para pagar)

            if (!monto || !descripcion) {
                return res.status(400).json({ success: false, message: 'Faltan datos del gasto' });
            }

            // 1. Registramos la transacción (GASTO)
            // Usamos el modelo que ya creamos antes
            await TransaccionModel.crear({
                tipo: 'GASTO',
                ambito: 'TAXI', // Asumimos que es gasto del trabajo
                monto: monto,
                cuenta_id: cuenta_id || 1, // Por defecto Efectivo
                viaje_id: null, // No está ligado a una carrera específica
                descripcion: descripcion
            });

            // 2. Restamos el dinero de la cuenta real
            await TransaccionModel.actualizarSaldoCuenta(cuenta_id || 1, monto, false); // false = es resta

            res.json({ success: true, message: 'Gasto registrado correctamente' });

        } catch (error) {
            console.error('Error al registrar gasto:', error);
            res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
    }
    // Acción: Obtener lista de carreras de HOY
    static async obtenerHistorialHoy(req, res) {
        try {
            // AHORA SÍ: Le pedimos los datos al Modelo (que sí tiene acceso a la BD)
            const historial = await ViajeModel.obtenerHistorialHoy();
            
            res.json({ success: true, data: historial });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al obtener historial' });
        }
    }

    // Acción: Anular carrera
    static async anularCarrera(req, res) {
        try {
            const { id } = req.params; // El ID viene en la URL
            await ViajeModel.anular(id);
            res.json({ success: true, message: 'Carrera anulada' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al anular' });
        }
    }
}

module.exports = ViajeController;