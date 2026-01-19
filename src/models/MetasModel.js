const db = require('../config/db');

class MetasModel {
    
    // Obtener el progreso (Se mantiene igual, estaba perfecto)
    static async obtenerProgreso() {
        const query = `
            SELECT 
                c.id, 
                c.nombre, 
                c.saldo_actual AS ahorrado, 
                IFNULL(m.monto_objetivo, 0) AS total 
            FROM cuentas c
            LEFT JOIN metas_cuentas m ON m.cuenta_id = c.id
            WHERE c.activo = 1 AND c.tipo = 'WARDA'
        `;
        // NOTA: Cambié JOIN por LEFT JOIN para que traiga las cuentas aunque no tengan meta configurada aún
        
        const [rows] = await db.query(query);
        return rows;
    }

    // ACTUALIZAR META (CORREGIDO CON LÓGICA INTELIGENTE)
    static async actualizarMeta(cuentaId, nuevoMonto) {
        // Esta consulta hace dos cosas:
        // 1. Intenta INSERTAR una nueva meta.
        // 2. Si el 'cuenta_id' ya existe (ON DUPLICATE KEY), entonces ACTUALIZA el monto.
        const query = `
            INSERT INTO metas_cuentas (cuenta_id, monto_objetivo) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE monto_objetivo = VALUES(monto_objetivo)
        `;
        
        const [result] = await db.query(query, [cuentaId, nuevoMonto]);
        return result;
    }
}

module.exports = MetasModel;