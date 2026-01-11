// UBICACIÓN: src/models/ViajeModel.js
const db = require('../config/db');

class ViajeModel {

    // Método 1: Crear un nuevo viaje (INSERT)
    static async iniciar(origenTipo) {
        try {
            const query = `
                INSERT INTO viajes (origen_tipo, fecha_hora_inicio, estado) 
                VALUES (?, DATE_SUB(NOW(), INTERVAL 5 HOUR), 'EN_CURSO')
            `;
            // Ejecutamos la consulta
            const [result] = await db.query(query, [origenTipo]);
            return result.insertId; // Devolvemos el ID del viaje creado (ej: 105)
        } catch (error) {
            throw error;
        }
    }

    // Método 2: Finalizar el viaje y cobrar (UPDATE)
    static async finalizar(id, monto, metodoPagoId) {
        try {
            const query = `
                UPDATE viajes 
                SET fecha_hora_fin = DATE_SUB(NOW(), INTERVAL 5 HOUR), 
                    monto_cobrado = ?, 
                    metodo_cobro_id = ?, 
                    estado = 'COMPLETADO' 
                WHERE id = ?
            `;
            const [result] = await db.query(query, [monto, metodoPagoId, id]);
            return result.affectedRows; // Devuelve 1 si se actualizó correctamente
        } catch (error) {
            throw error;
        }
    }

    // Método 3: Guardar rastro GPS (INSERT en tabla secundaria)
    static async guardarRastro(viajeId, lat, lng, tipo) {
        try {
            const query = `
                INSERT INTO ruta_gps_logs (viaje_id, latitud, longitud, tipo_punto, hora_registro) 
                VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `;
            const [result] = await db.query(query, [viajeId, lat, lng, tipo]);
            return result;
        } catch (error) {
            throw error;
        }
    }

    // Método para sumar lo ganado hoy
    static async obtenerTotalDia() {
        const query = `
            SELECT SUM(monto_cobrado) as total 
            FROM viajes 
            WHERE DATE(fecha_hora_fin) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR)) 
            AND estado = 'COMPLETADO'
        `;
        const [rows] = await db.query(query);
        // Si es null (nadie trabajó hoy), devolvemos 0
        return rows[0].total || 0;
    }

    // 1. VERSIÓN MEJORADA: Trae las últimas 20 carreras (siempre muestra algo)
    static async obtenerHistorialHoy() {
        const query = `
            SELECT 
                id, 
                origen_tipo, 
                monto_cobrado, 
                metodo_cobro_id, 
                fecha_hora_fin, /* Traemos la fecha cruda para filtrar en JS si queremos */
                DATE_FORMAT(DATE_SUB(fecha_hora_fin, INTERVAL 5 HOUR), '%h:%i %p') as hora_fin,
                DATE_FORMAT(DATE_SUB(fecha_hora_fin, INTERVAL 5 HOUR), '%d/%m') as dia_mes
            FROM viajes 
            WHERE estado = 'COMPLETADO'
            ORDER BY id DESC
            LIMIT 20
        `;
        const [rows] = await db.query(query);
        return rows;
    }

    static async anular(id) {
        try {
            // 1. PRIMERO: Borramos el dinero distribuido (Transacciones)
            // Si no hacemos esto, la billetera seguirá sumando ese dinero.
            await db.query("DELETE FROM transacciones WHERE viaje_id = ?", [id]);

            // 2. SEGUNDO: Marcamos el viaje como CANCELADO (Soft Delete)
            // No lo borramos del todo para que quede registro de que existió pero se anuló.
            const query = `
                UPDATE viajes 
                SET estado = 'CANCELADO', monto_cobrado = 0 
                WHERE id = ?
            `;
            const [result] = await db.query(query, [id]);
            return result.affectedRows;

        } catch (error) {
            throw error;
        }
    }

    static async obtenerEstadisticas(periodo = 'mes') {
        let filtroFecha = "";
        
        // Ajustamos la hora a Perú (-5h) para todos los cálculos
        const fechaCol = "DATE_SUB(fecha_hora_fin, INTERVAL 5 HOUR)";
        const fechaHoy = "DATE_SUB(NOW(), INTERVAL 5 HOUR)";

        if (periodo === 'hoy') {
            filtroFecha = `DATE(${fechaCol}) = DATE(${fechaHoy})`;
        } else if (periodo === 'semana') {
            // Año y Semana coinciden
            filtroFecha = `YEARWEEK(${fechaCol}, 1) = YEARWEEK(${fechaHoy}, 1)`;
        } else {
            // Por defecto: MES actual
            filtroFecha = `MONTH(${fechaCol}) = MONTH(${fechaHoy}) AND YEAR(${fechaCol}) = YEAR(${fechaHoy})`;
        }

        const query = `
            SELECT origen_tipo, SUM(monto_cobrado) as total
            FROM viajes
            WHERE estado = 'COMPLETADO'
            AND ${filtroFecha}
            GROUP BY origen_tipo
        `;
        const [rows] = await db.query(query);
        return rows;
    }

    static async obtenerReporteCompleto() {
        // Aquí sí tenemos acceso a 'db'
        const query = `
            SELECT 
                id, 
                origen_tipo as App, 
                monto_cobrado as Monto, 
                DATE_FORMAT(DATE_SUB(fecha_hora_inicio, INTERVAL 5 HOUR), '%Y-%m-%d %H:%i:%s') as Inicio,
                DATE_FORMAT(DATE_SUB(fecha_hora_fin, INTERVAL 5 HOUR), '%Y-%m-%d %H:%i:%s') as Fin,
                CASE WHEN metodo_cobro_id = 1 THEN 'Efectivo' ELSE 'Yape' END as Pago,
                estado
            FROM viajes 
            WHERE estado = 'COMPLETADO'
            ORDER BY id DESC
        `;
        const [rows] = await db.query(query);
        return rows;
    }

    // 2. VERSIÓN MEJORADA: Gráfico Semanal (Más flexible)
    static async obtenerGananciasUltimos7Dias() {
        try {
            const query = `
                SELECT 
                    DATE(DATE_SUB(fecha_hora_fin, INTERVAL 5 HOUR)) as fecha,
                    SUM(monto_cobrado) as total
                FROM viajes
                WHERE estado = 'COMPLETADO'
                GROUP BY fecha
                ORDER BY fecha DESC
                LIMIT 7
            `;
            const [rows] = await db.query(query);
            
            // Invertimos el orden para que el gráfico vaya de Lunes -> Domingo (No al revés)
            // Y formateamos el nombre del día
            const resultados = rows.reverse().map(r => {
                const fechaObj = new Date(r.fecha);
                // Truco: Forzamos la zona horaria para que el nombre del día sea correcto
                fechaObj.setMinutes(fechaObj.getMinutes() + fechaObj.getTimezoneOffset());
                
                const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
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