// UBICACIÓN: src/controllers/ViajeController.js
const ViajeModel = require('../models/ViajeModel');
const db = require('../config/db');
const https = require('https'); 

class ViajeController {

    static async iniciarCarrera(req, res) {
        try {
            const { origen_tipo, lat, lng, origen_texto } = req.body;

            if (!origen_tipo) return res.status(400).json({ success: false, message: 'Falta tipo' });

            // 1. Guardamos rápido
            const textoInicial = origen_texto || 'Ubicación GPS...';
            const idViaje = await ViajeModel.iniciar(origen_tipo, textoInicial);

            // 2. Guardamos GPS
            if (lat && lng) {
                await ViajeModel.guardarRastro(idViaje, lat, lng, 'INICIO');
            }

            // 3. RESPONDEMOS AL CELULAR INMEDIATAMENTE
            res.json({
                success: true,
                message: 'Carrera iniciada',
                data: { id_viaje: idViaje }
            });

            // 4. TAREA DE FONDO: Buscar nombre de calle
            if (!origen_texto && lat && lng) {
                // CORRECCIÓN AQUÍ: Usamos el nombre de la clase, no 'this'
                ViajeController.resolverDireccionBackground(idViaje, lat, lng, 'ORIGEN');
            }

        } catch (error) {
            console.error('Error al iniciar:', error);
            if (!res.headersSent) res.status(500).json({ success: false, message: 'Error server' });
        }
    }

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

            // 5. RESPONDEMOS RÁPIDO
            res.json({ success: true, message: 'Cobrado' });

            // 6. TAREA DE FONDO: Buscar nombre de calle destino
            if (!destino_texto && lat && lng) {
                // CORRECCIÓN AQUÍ: Usamos el nombre de la clase, no 'this'
                ViajeController.resolverDireccionBackground(id_viaje, lat, lng, 'DESTINO');
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
    // MAGIA DE FONDO: BUSCADOR ROBUSTO
    // ==========================================
    static resolverDireccionBackground(idViaje, lat, lng, tipo) {
        console.log(`📡 Buscando dirección ${tipo} para ID: ${idViaje}...`);
        
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        
        const options = {
            headers: { 
                'User-Agent': 'TaxiManagerApp/1.0 (raul@taxi.com)', 
                'Accept-Language': 'es' 
            } 
        };

        https.get(url, options, (res) => {
            let data = '';
            
            if (res.statusCode !== 200) {
                console.error(`❌ Error Nominatim: Código ${res.statusCode}`);
                res.resume();
                return;
            }

            res.on('data', (chunk) => { data += chunk; });
            
            res.on('end', async () => {
                try {
                    const json = JSON.parse(data);
                    
                    if (json && json.address) {
                        const calle = json.address.road || json.address.pedestrian || json.address.construction || '';
                        const numero = json.address.house_number || '';
                        const barrio = json.address.neighbourhood || json.address.residential || json.address.suburb || '';
                        
                        let direccion = `${calle} ${numero}`.trim();
                        if (direccion.length < 3 && barrio) direccion = barrio;
                        if (direccion.length > 5 && barrio && !direccion.includes(barrio)) direccion += `, ${barrio}`;

                        if (direccion.length > 2) {
                            const campo = tipo === 'ORIGEN' ? 'origen_texto' : 'destino_texto';
                            await db.query(`UPDATE viajes SET ${campo} = ? WHERE id = ?`, [direccion, idViaje]);
                            console.log(`✅ Dirección GUARDADA (${tipo}): ${direccion}`);
                        }
                    }
                } catch (e) { 
                    console.error("Error procesando JSON de mapa:", e.message); 
                }
            });

        }).on('error', (err) => {
            console.error("Error de conexión con mapas:", err.message);
        });
    }

    // Acción: Obtener puntos GPS de un viaje para el mapa
    static async obtenerRutaGPS(req, res) {
        try {
            const { id } = req.params;
            // Consultamos la tabla 'rastros' que guarda INICIO, FIN y PARADAS
            const [puntos] = await db.query(`
                SELECT lat, lng, tipo, fecha 
                FROM rastros 
                WHERE viaje_id = ? 
                ORDER BY id ASC
            `, [id]);
            
            res.json({ success: true, data: puntos });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al obtener ruta' });
        }
    }
}

module.exports = ViajeController;