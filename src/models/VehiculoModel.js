// UBICACIÓN: src/models/VehiculoModel.js
const db = require('../config/db');

class VehiculoModel {

    // 1. Obtener la información del auto (Siempre ID 1)
    static async obtener() {
        const query = "SELECT * FROM vehiculo WHERE id = 1";
        const [rows] = await db.query(query);
        return rows[0]; // Retorna el objeto del auto o undefined
    }

    // 2. Actualizar Odómetro (Tablero)
    static async actualizarOdometro(nuevoKm) {
        const query = `
            UPDATE vehiculo 
            SET odometro_actual = ?, 
                ultima_actualizacion = DATE_SUB(NOW(), INTERVAL 5 HOUR)
            WHERE id = 1
        `;
        const [result] = await db.query(query, [nuevoKm]);
        return result.affectedRows > 0;
    }

    // 3. Registrar Mantenimiento (Resetear la meta del aceite)
    static async actualizarProximoCambio(nuevoMetaKm) {
        const query = `
            UPDATE vehiculo 
            SET proximo_cambio_aceite = ?
            WHERE id = 1
        `;
        const [result] = await db.query(query, [nuevoMetaKm]);
        return result.affectedRows > 0;
    }

    // 4. Inicializar (Por si la tabla está vacía, crear el registro 1)
    static async inicializar(kmInicial, metaInicial) {
        const query = `
            INSERT INTO vehiculo (id, odometro_actual, proximo_cambio_aceite) 
            SELECT 1, ?, ? 
            WHERE NOT EXISTS (SELECT * FROM vehiculo)
        `;
        await db.query(query, [kmInicial, metaInicial]);
    }
    // 5. NUEVO: Actualizar Fechas de Documentos
    static async actualizarDocumentos(soat, revision, gnv) {
        const query = `
            UPDATE vehiculo 
            SET fecha_soat = ?, 
                fecha_revision = ?, 
                fecha_gnv = ?
            WHERE id = 1
        `;
        // Si viene vacío, guardamos NULL
        const params = [
            soat || null, 
            revision || null, 
            gnv || null
        ];
        
        const [result] = await db.query(query, params);
        return result.affectedRows > 0;
    }
}

module.exports = VehiculoModel;