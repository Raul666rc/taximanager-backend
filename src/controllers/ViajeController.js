// UBICACIÓN: src/controllers/ViajeController.js
const ViajeModel = require('../models/ViajeModel');
const db = require('../config/db'); // Necesitamos acceso directo a BD para transacciones rápidas

class ViajeController {

    // Acción: Iniciar Carrera
    static async iniciarCarrera(req, res) {
        try {
            // Recibimos datos del frontend (celular)
            // AHORA RECIBIMOS 'origen_texto' TAMBIÉN
            const { origen_tipo, lat, lng, origen_texto } = req.body;

            // Validación básica
            if (!origen_tipo) {
                return res.status(400).json({ success: false, message: 'Falta el tipo de origen' });
            }

            // 1. Llamamos al Modelo (Pasamos el texto de la dirección si existe)
            const idViaje = await ViajeModel.iniciar(origen_tipo, origen_texto);

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
    // (Este método estaba bien, lo dejamos igual)
    static async registrarParada(req, res) {
        try {
            const { id_viaje, lat, lng, tipo } = req.body; 
            
            if (!id_viaje || !lat || !lng) {
                return res.status(400).json({ success: false, message: 'Faltan coordenadas o ID de viaje' });
            }

            const tipoPunto = tipo || 'PARADA'; 
            await ViajeModel.guardarRastro(id_viaje, lat, lng, tipoPunto);

            res.json({ success: true, message: 'Punto registrado correctamente' });

        } catch (error) {
            console.error('Error al registrar punto:', error);
            res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
    }

    // Acción: Terminar Carrera (CORREGIDO PARA V3.0)
    static async terminarCarrera(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const { 
                id_viaje, 
                monto, 
                metodo_pago_id, 
                lat, lng, 
                distancia_km,    // <--- NUEVO
                duracion_min,    // <--- NUEVO
                destino_texto,   // <--- NUEVO
                origen_texto     // <--- Opcional (si se corrigió al final)
            } = req.body;

            if(!id_viaje || !monto || !metodo_pago_id) {
                return res.status(400).json({ success: false, message: 'Faltan datos de cobro' });
            }

            // 1. Cerrar el viaje en BD (Pasamos TODOS los parámetros nuevos)
            // Nota: Usamos el Modelo, pero como requiere muchos parámetros, asegúrate que coincidan con ViajeModel.js
            await ViajeModel.finalizar(
                id_viaje, 
                monto, 
                metodo_pago_id, 
                distancia_km || 0, 
                duracion_min || 0, 
                destino_texto || '',
                origen_texto || null
            );

            // 2. Guardar punto GPS final
            if (lat && lng) {
                await ViajeModel.guardarRastro(id_viaje, lat, lng, 'FIN');
            }

            // 3. REGISTRAR EL INGRESO DE DINERO (Manual, sin TransaccionModel)
            // Esto asegura que funcione con la nueva tabla 'transacciones' V3.0
            await connection.query(`
                INSERT INTO transacciones 
                (tipo, monto, descripcion, cuenta_id, viaje_id, fecha, ambito, categoria) 
                VALUES ('INGRESO', ?, 'Ingreso por Carrera', ?, ?, NOW(), 'TAXI', 'Servicio')
            `, [monto, metodo_pago_id, id_viaje]);

            // 4. ACTUALIZAR SALDO DE LA CUENTA (Yape o Efectivo)
            await connection.query(`
                UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = ?
            `, [monto, metodo_pago_id]);

            await connection.commit();

            res.json({ 
                success: true, 
                message: 'Carrera finalizada y saldo actualizado.' 
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error al terminar:', error);
            res.status(500).json({ success: false, message: 'Error al procesar el cierre del viaje' });
        } finally {
            connection.release();
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

    // Acción: Registrar Gasto (Simplificado para usar lógica directa)
    static async registrarGasto(req, res) {
        try {
            const { monto, descripcion, cuenta_id } = req.body;

            if (!monto || !descripcion) {
                return res.status(400).json({ success: false, message: 'Faltan datos del gasto' });
            }

            // Inserción directa compatible con V3.0
            // Nota: Es mejor usar FinanzasController para esto, pero lo dejamos aquí por compatibilidad
            const cuenta = cuenta_id || 1; // 1 = Efectivo por defecto

            // 1. Insertar Transacción
            await db.query(`
                INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, fecha, ambito, categoria)
                VALUES ('GASTO', ?, ?, ?, NOW(), 'TAXI', 'Gasto Operativo')
            `, [monto, descripcion, cuenta]);

            // 2. Restar Saldo
            await db.query(`UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?`, [monto, cuenta]);

            res.json({ success: true, message: 'Gasto registrado correctamente' });

        } catch (error) {
            console.error('Error al registrar gasto:', error);
            res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
    }

    static async obtenerHistorialHoy(req, res) {
        try {
            const historial = await ViajeModel.obtenerHistorialHoy();
            res.json({ success: true, data: historial });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al obtener historial' });
        }
    }

    static async anularCarrera(req, res) {
        try {
            const { id } = req.params; 
            await ViajeModel.anular(id);
            res.json({ success: true, message: 'Carrera anulada' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al anular' });
        }
    }

    // Acción: Descargar Reporte Excel (ACTUALIZADO V3.0)
    static async descargarReporte(req, res) {
        try {
            const viajes = await ViajeModel.obtenerReporteCompleto();

            // AGREGAMOS LAS COLUMNAS NUEVAS AL CSV
            let csv = "ID,APP,MONTO,INICIO,FIN,ORIGEN,DESTINO,KM,METODO PAGO,ESTADO\n";

            viajes.forEach(v => {
                const app = v.App || 'DESCONOCIDO';
                const monto = v.Monto || 0;
                const inicio = v.Inicio || '';
                const fin = v.Fin || '';
                // Nuevos campos:
                const origen = (v.Origen || '').replace(/,/g, ' '); // Quitamos comas para no romper CSV
                const destino = (v.Destino || '').replace(/,/g, ' ');
                const km = v.Km || 0;
                
                const pago = v.Pago || 'Efectivo';
                const estado = v.estado || '';

                csv += `${v.id},${app},${monto},${inicio},${fin},${origen},${destino},${km},${pago},${estado}\n`;
            });

            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', 'attachment; filename="reporte_completo_v3.csv"');
            res.status(200).send(csv);

        } catch (error) {
            console.error("Error reporte:", error);
            res.status(500).send("Error al generar reporte: " + error.message);
        }
    }
}

module.exports = ViajeController;