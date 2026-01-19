const db = require('../config/db');

class MetasModel {
    
    // 1. OBTENER PROGRESO (LISTADO)
    // Usamos LEFT JOIN para ver TODAS las cuentas WARDA/BANCO, 
    // incluso si todavía no tienen meta (saldrá meta: 0 o null)
    static async obtenerProgreso() {
        const query = `
            SELECT 
                c.id, 
                c.nombre, 
                c.saldo_actual AS ahorrado, 
                COALESCE(m.monto_objetivo, 0) AS total 
            FROM cuentas c
            LEFT JOIN metas_cuentas m ON m.cuenta_id = c.id
            WHERE c.activo = 1 
              AND c.tipo NOT IN ('EFECTIVO') -- Excluimos efectivo, pero incluimos Bancos y Wardas
        `;
        
        const [rows] = await db.query(query);
        return rows;
    }

    // 2. GUARDAR META (Lógica Inteligente)
    static async actualizarMeta(cuentaId, nuevoMonto) {
        // EXPLICACIÓN:
        // Intenta insertar una nueva fila.
        // Si MySQL detecta que el 'cuenta_id' ya existe (gracias al UNIQUE INDEX),
        // automáticamente salta a la parte 'ON DUPLICATE KEY UPDATE' y solo cambia el monto.
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