// UBICACIÓN: src/controllers/FinanzasController.js
const db = require('../config/db');
const ViajeModel = require('../models/ViajeModel');

class FinanzasController {

    static async obtenerBilletera(req, res) {
        try {
            // 1. Consultar Saldos REALES (Dónde está el dinero físico)
            const [cuentas] = await db.query("SELECT nombre, saldo_actual FROM cuentas");
            
            // 2. Calcular el AHORRO ACUMULADO (Virtual)
            // Sumamos todas las transacciones que digan 'Fondo Ahorro'
            const [ahorro] = await db.query(`
                SELECT SUM(monto) as total 
                FROM transacciones 
                WHERE descripcion LIKE '%Ahorro%'
            `);

            // 3. Calcular el GASTO TOTAL DEL MES (Para que controles tu mano)
            const [gastos] = await db.query(`
                SELECT SUM(monto) as total 
                FROM transacciones 
                WHERE tipo = 'GASTO' 
                AND MONTH(fecha) = MONTH(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `);

            res.json({
                success: true,
                data: {
                    cuentas: cuentas, // Array con saldo de Efectivo y Yape
                    ahorro_total: ahorro[0].total || 0,
                    gasto_mensual: gastos[0].total || 0
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al calcular finanzas' });
        }
    }

    static async obtenerBilletera(req, res) {
        try {
            const [cuentas] = await db.query("SELECT nombre, saldo_actual FROM cuentas");
            
            const [ahorro] = await db.query(`
                SELECT SUM(monto) as total FROM transacciones WHERE descripcion LIKE '%Ahorro%'
            `);

            const [gastos] = await db.query(`
                SELECT SUM(monto) as total FROM transacciones 
                WHERE tipo = 'GASTO' AND MONTH(fecha) = MONTH(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `);

            // --- NUEVO: Pedimos los datos del gráfico ---
            const estadisticas = await ViajeModel.obtenerEstadisticasMes();
            // --------------------------------------------

            res.json({
                success: true,
                data: {
                    cuentas: cuentas,
                    ahorro_total: ahorro[0].total || 0,
                    gasto_mensual: gastos[0].total || 0,
                    estadisticas: estadisticas // <--- Lo enviamos al celular
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error finanzas' });
        }
    }
}

module.exports = FinanzasController;