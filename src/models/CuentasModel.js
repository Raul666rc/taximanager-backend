const db = require('../config/db');

class CuentasModel {

    // 1. Obtener TODAS (Para el panel de administración, incluso las inactivas)
    static async obtenerTodas() {
        const query = "SELECT * FROM cuentas ORDER BY activo DESC, id ASC";
        const [rows] = await db.query(query);
        return rows;
    }

    // 2. Obtener SOLO ACTIVAS (Para llenar los selectores de transferencia)
    static async obtenerActivas() {
        const query = "SELECT * FROM cuentas WHERE activo = 1 ORDER BY id ASC";
        const [rows] = await db.query(query);
        return rows;
    }

    // 3. Crear Nueva Cuenta
    static async crear(nombre, tipo) {
        const query = "INSERT INTO cuentas (nombre, tipo, saldo_actual, activo) VALUES (?, ?, 0.00, 1)";
        const [result] = await db.query(query, [nombre, tipo]);
        return result.insertId;
    }

    // 4. Editar Nombre
    static async editar(id, nombre) {
        const query = "UPDATE cuentas SET nombre = ? WHERE id = ?";
        const [result] = await db.query(query, [nombre, id]);
        return result.affectedRows > 0;
    }

    // 5. Activar / Desactivar (El interruptor)
    static async cambiarEstado(id, nuevoEstado) {
        const query = "UPDATE cuentas SET activo = ? WHERE id = ?";
        const [result] = await db.query(query, [nuevoEstado, id]);
        return result.affectedRows > 0;
    }
}

module.exports = CuentasModel;