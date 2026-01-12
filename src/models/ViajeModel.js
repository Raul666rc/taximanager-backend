// UBICACIÓN: src/models/ViajeModel.js
const db = require('../config/db');

class ViajeModel {

    // Método 1: Iniciar Viaje
    static async iniciar(origenTipo, origenTexto = '') {
        try {
            // Guardamos fecha con resta de 5 horas (Hora Perú)
            const query = `
                INSERT INTO viajes (origen_tipo, origen_texto, fecha_hora_inicio, estado) 
                VALUES (?, ?, DATE_SUB(NOW(), INTERVAL 5 HOUR), 'EN_CURSO')
            `;
            const [result] = await db.query(query, [origenTipo, origenTexto]);
            return result.insertId;
        } catch (error) {
            throw error;
        }
    }

    // Método 2: Finalizar y Cobrar
    static async finalizar(id, monto, metodoPagoId, distanciaKm = 0, duracionMin = 0, destinoTexto = '', origenTexto = null) {
        try {
            // Lógica dinámica para actualizar origen solo si se corrigió
            let sqlUpdateOrigen = "";
            let params = [monto, metodoPagoId, distanciaKm, duracionMin, destinoTexto];

            if (origenTexto) {
                sqlUpdateOrigen = ", origen_texto = ?";
                params.push(origenTexto);
            }

            params.push(id); // El ID va al final para el WHERE

            const query = `
                UPDATE viajes 
                SET fecha_hora_fin = DATE_SUB(NOW(), INTERVAL 5 HOUR), 
                    monto_cobrado = ?, 
                    metodo_cobro_id = ?, 
                    estado = 'COMPLETADO',
                    distancia_km = ?,
                    duracion_minutos = ?,
                    destino_texto = ?
                    ${sqlUpdateOrigen}
                WHERE id = ?
            `;
            
            const [result] = await db.query(query, params);
            return result.affectedRows;
        } catch (error) {
            throw error;
        }
    }

    // Método 3: Guardar Rastro GPS (Adaptado a tu tabla ruta_gps_logs)
    static async guardarRastro(viajeId, lat, lng, tipo) {
        try {
            // Usamos TIME(...) porque tu tabla define 'hora_registro' como tipo TIME
            const query = `
                INSERT INTO ruta_gps_logs (viaje_id, latitud, longitud, tipo_punto, hora_registro) 
                VALUES (?, ?, ?, ?, TIME(DATE_SUB(NOW(), INTERVAL 5 HOUR)))
            `;
            const [result] = await db.query(query, [viajeId, lat, lng, tipo]);
            return result;
        } catch (error) {
            throw error;
        }
    }

    // Método 4: Anular Viaje (Tu lógica robusta con transacciones)
    static async anular(id) {
        try {
            const connection = await db.getConnection();
            await connection.beginTransaction();

            // 1. Borrar dinero distribuido (Transacciones)
            await connection.query("DELETE FROM transacciones WHERE viaje_id = ?", [id]);

            // 2. Cancelar viaje (O borrarlo, según prefieras. Aquí lo marcamos CANCELADO)
            await connection.query(`
                UPDATE viajes SET estado = 'CANCELADO', monto_cobrado = 0 
                WHERE id = ?
            `, [id]);

            await connection.commit();
            connection.release();
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    // ==========================================
    //      REPORTES Y LECTURA
    // ==========================================

    // Historial de Hoy
    static async obtenerHistorialHoy() {
        const query = `
            SELECT 
                id, origen_tipo, monto_cobrado, metodo_cobro_id, 
                DATE_FORMAT(fecha_hora_fin, '%h:%i %p') as hora_fin,
                DATE_FORMAT(fecha_hora_fin, '%d/%m') as dia_mes,
                origen_texto, destino_texto
            FROM viajes 
            WHERE DATE(fecha_hora_inicio) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            AND estado = 'COMPLETADO'
            ORDER BY id DESC
        `;
        const [rows] = await db.query(query);
        return rows;
    }

    // Ganancia Hoy Perú
    static async obtenerGananciaHoyPeru() {
        const query = `
            SELECT SUM(monto_cobrado) as total
            FROM viajes
            WHERE estado = 'COMPLETADO'
            AND DATE(fecha_hora_fin) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
        `;
        const [rows] = await db.query(query);
        return rows[0].total || 0;
    }

    // Total del Día (Para resumen rápido)
    static async obtenerTotalDia() {
        const query = `
            SELECT SUM(monto_cobrado) as total 
            FROM viajes 
            WHERE DATE(fecha_hora_inicio) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            AND estado = 'COMPLETADO'
        `;
        const [rows] = await db.query(query);
        return rows[0].total || 0;
    }

    // Estadísticas (Dona)
    static async obtenerEstadisticas(periodo = 'mes') {
        let filtroFecha = "";
        const fechaCol = "fecha_hora_fin"; 
        const fechaHoy = "DATE_SUB(NOW(), INTERVAL 5 HOUR)";

        if (periodo === 'hoy') {
            filtroFecha = `DATE(${fechaCol}) = DATE(${fechaHoy})`;
        } else if (periodo === 'semana') {
            filtroFecha = `YEARWEEK(${fechaCol}, 1) = YEARWEEK(${fechaHoy}, 1)`;
        } else {
            filtroFecha = `MONTH(${fechaCol}) = MONTH(${fechaHoy}) AND YEAR(${fechaCol}) = YEAR(${fechaHoy})`;
        }

        const query = `
            SELECT origen_tipo, SUM(monto_cobrado) as total
            FROM viajes
            WHERE estado = 'COMPLETADO' AND ${filtroFecha}
            GROUP BY origen_tipo
        `;
        const [rows] = await db.query(query);
        return rows;
    }

    // Reporte Excel Completo
    static async obtenerReporteCompleto() {
        const query = `
            SELECT 
                id, 
                origen_tipo as App, 
                monto_cobrado as Monto, 
                DATE_FORMAT(fecha_hora_inicio, '%Y-%m-%d %H:%i:%s') as Inicio,
                DATE_FORMAT(fecha_hora_fin, '%Y-%m-%d %H:%i:%s') as Fin,
                origen_texto as Origen,
                destino_texto as Destino,
                distancia_km as Km,
                CASE WHEN metodo_cobro_id = 1 THEN 'Efectivo' ELSE 'Yape' END as Pago,
                estado
            FROM viajes 
            WHERE estado = 'COMPLETADO'
            ORDER BY id DESC
        `;
        const [rows] = await db.query(query);
        return rows;
    }

    // Gráfico Semanal (Barras)
    static async obtenerGananciasUltimos7Dias() {
        try {
            const query = `
                SELECT 
                    DATE(fecha_hora_fin) as fecha,
                    SUM(monto_cobrado) as total
                FROM viajes
                WHERE fecha_hora_fin >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                AND estado = 'COMPLETADO'
                GROUP BY fecha
                ORDER BY fecha ASC
            `;
            const [rows] = await db.query(query);
            
            // Mapeamos los días al español
            const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            
            const resultados = rows.map(r => {
                // Ajuste de zona horaria manual para que el día coincida
                const fechaObj = new Date(r.fecha);
                // Le sumamos 5 horas solo para que JS detecte el día correcto si el servidor está en UTC
                fechaObj.setHours(fechaObj.getHours() + 5); 
                
                return {
                    dia_nombre: dias[fechaObj.getDay()],
                    total: parseFloat(r.total)
                };
            });
            return resultados;
        } catch (error) {
            console.error(error);
            return [];
        }
    }
}

module.exports = ViajeModel;