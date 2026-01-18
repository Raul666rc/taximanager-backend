const db = require('../config/db');

class MetasModel {
    
    // Obtener el progreso de las Wardas que tienen meta configurada
    static async obtenerProgreso() {
        // JOIN: Trae el saldo REAL de tu tabla 'cuentas' 
        // y lo junta con la meta de 'metas_cuentas'
        const query = `
            SELECT 
                c.id, 
                c.nombre, 
                c.saldo_actual AS ahorrado, 
                m.monto_objetivo AS total
            FROM metas_cuentas m
            JOIN cuentas c ON m.cuenta_id = c.id
        `;
        
        const [rows] = await db.query(query);
        return rows;
    }
}

module.exports = MetasModel;