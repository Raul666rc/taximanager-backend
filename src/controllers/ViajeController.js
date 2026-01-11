// UBICACIÓN: src/controllers/ViajeController.js
const ViajeModel = require('../models/ViajeModel');
const db = require('../config/db');

class ViajeController {

    // Acción: Iniciar Carrera (Respuesta Inmediata + Búsqueda de fondo)
    static async iniciarCarrera(req, res) {
        try {
            const { origen_tipo, lat, lng, origen_texto } = req.body;

            if (!origen_tipo) return res.status(400).json({ success: false, message: 'Falta tipo' });

            // 1. Guardamos rápido (Si mandaste texto manual, lo usamos. Si no, guardamos "GPS...")
            const textoInicial = origen_texto || 'Ubicación GPS...';
            const idViaje = await ViajeModel.iniciar(origen_tipo, textoInicial);

            // 2. Guardamos GPS
            if (lat && lng) {
                await ViajeModel.guardarRastro(idViaje, lat, lng, 'INICIO');
            }

            // 3. RESPONDEMOS AL CELULAR INMEDIATAMENTE (Para que no esperes)
            res.json({
                success: true,
                message: 'Carrera iniciada',
                data: { id_viaje: idViaje }
            });

            // 4. TAREA DE FONDO (INVISIBLE): Buscar nombre de calle
            // Solo si no escribiste nada manualmente
            if (!origen_texto && lat && lng) {
                this.resolverDireccionBackground(idViaje, lat, lng, 'ORIGEN');
            }

        } catch (error) {
            console.error('Error al iniciar:', error);
            if (!res.headersSent) res.status(500).json({ success: false, message: 'Error server' });
        }
    }

    // Acción: Terminar Carrera (Respuesta Inmediata + Búsqueda de fondo)
    static async terminarCarrera(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const { 
                id_viaje, monto, metodo_pago_id, lat, lng, 
                distancia_km, duracion_min, destino_texto 
            } = req.body;

            if(!id_viaje || !monto) return res.status(400).json({ success: false, message: 'Faltan datos' });

            // 1. Finalizar en BD
            const textoDestinoInicial = destino_texto || 'Destino GPS...';
            
            await ViajeModel.finalizar(
                id_viaje, monto, metodo_pago_id, 
                distancia_km || 0, duracion_min || 0, textoDestinoInicial, null
            );

            // 2. Guardar GPS Fin
            if (lat && lng) await ViajeModel.guardarRastro(id_viaje, lat, lng, 'FIN');

            // 3. Registrar Dinero
            await connection.query(`
                INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, viaje_id, fecha, ambito, categoria) 
                VALUES ('INGRESO', ?, 'Ingreso por Carrera', ?, ?, NOW(), 'TAXI', 'Servicio')
            `, [monto, metodo_pago_id, id_viaje]);

            // 4. Actualizar Saldo
            await connection.query(`UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = ?`, [monto, metodo_pago_id]);

            await connection.commit();

            // 5. RESPONDEMOS RÁPIDO AL CELULAR
            res.json({ success: true, message: 'Cobrado' });

            // 6. TAREA DE FONDO: Buscar nombre de calle destino
            if (!destino_texto && lat && lng) {
                this.resolverDireccionBackground(id_viaje, lat, lng, 'DESTINO');
            }

        } catch (error) {
            await connection.rollback();
            console.error('Error terminar:', error);
            if (!res.headersSent) res.status(500).json({ success: false, message: 'Error server' });
        } finally {
            connection.release();
        }
    }

    // --- MÉTODOS AUXILIARES ---

    static async registrarParada(req, res) {
        try {
            const { id_viaje, lat, lng, tipo } = req.body; 
            if (!id_viaje || !lat || !lng) return res.status(400).json({ error: 'Datos incompletos' });
            
            await ViajeModel.guardarRastro(id_viaje, lat, lng, tipo || 'PARADA');
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }

    static async obtenerResumen(req, res) {
        try {
            const total = await ViajeModel.obtenerTotalDia();
            res.json({ success: true, total: total });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }

    static async registrarGasto(req, res) {
        try {
            const { monto, descripcion, cuenta_id } = req.body;
            if (!monto) return res.status(400).json({ error: 'Falta monto' });
            
            await db.query(`INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, fecha, ambito, categoria) VALUES ('GASTO', ?, ?, ?, NOW(), 'TAXI', 'Gasto')`, [monto, descripcion, cuenta_id||1]);
            await db.query(`UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?`, [monto, cuenta_id||1]);
            
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }

    static async obtenerHistorialHoy(req, res) {
        try {
            const historial = await ViajeModel.obtenerHistorialHoy();
            res.json({ success: true, data: historial });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }

    static async anularCarrera(req, res) {
        try {
            await ViajeModel.anular(req.params.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }

    static async descargarReporte(req, res) {
        try {
            const viajes = await ViajeModel.obtenerReporteCompleto();
            let csv = "ID,APP,MONTO,INICIO,FIN,ORIGEN,DESTINO,KM,METODO PAGO,ESTADO\n";
            viajes.forEach(v => {
                const origen = (v.Origen || '').replace(/,/g, ' '); 
                const destino = (v.Destino || '').replace(/,/g, ' ');
                csv += `${v.id},${v.App},${v.Monto},${v.Inicio},${v.Fin},${origen},${destino},${v.Km||0},${v.Pago},${v.estado}\n`;
            });
            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', 'attachment; filename="reporte_v3.csv"');
            res.status(200).send(csv);
        } catch (e) { res.status(500).send(e.message); }
    }

    // ==========================================
    // MAGIA DE FONDO: BUSCADOR DE DIRECCIONES
    // ==========================================
    static async resolverDireccionBackground(idViaje, lat, lng, tipo) {
        try {
            // Esperamos 1 segundo para no saturar
            // await new Promise(r => setTimeout(r, 1000));

            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            
            // Usamos fetch nativo de Node (versiones modernas)
            const response = await fetch(url, { headers: { 'User-Agent': 'TaxiManagerApp/1.0' } });
            const data = await response.json();

            if (data && data.address) {
                const calle = data.address.road || data.address.pedestrian || '';
                const numero = data.address.house_number || '';
                const barrio = data.address.neighbourhood || data.address.suburb || '';
                let direccion = `${calle} ${numero}`.trim();
                if (barrio) direccion += `, ${barrio}`;
                
                if (direccion.length > 5) {
                    const campo = tipo === 'ORIGEN' ? 'origen_texto' : 'destino_texto';
                    await db.query(`UPDATE viajes SET ${campo} = ? WHERE id = ?`, [direccion, idViaje]);
                    console.log(`📍 Dirección actualizada (${tipo}): ${direccion}`);
                }
            }
        } catch (error) {
            console.error("Error background GPS:", error.message);
            // No pasa nada si falla, el usuario ya cobró y está feliz.
        }
    }
}

module.exports = ViajeController;