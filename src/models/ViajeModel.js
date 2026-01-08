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
}

module.exports = ViajeModel;