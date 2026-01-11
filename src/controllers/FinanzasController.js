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
            // Leemos el filtro de la URL (ej: ?periodo=semana)
            const periodo = req.query.periodo || 'mes';

            // 1. OBTENER META DEL USUARIO (Asumimos ID 1 o lo sacamos del login si tuvieramos el token a mano)
            // Para simplificar por ahora, usaremos el ID 1 (Admin)
            // 1. Pedimos la Meta (si no existe, 200)
            const [userRows] = await db.query("SELECT meta_diaria FROM usuarios WHERE id = 1");
            const meta = userRows[0]?.meta_diaria || 200;

            const [cuentas] = await db.query("SELECT nombre, saldo_actual FROM cuentas");
            
            // ... (Ahorro y Gastos los dejamos igual, o podrías filtrarlos también si quieres) ...
            const [ahorro] = await db.query("SELECT SUM(monto) as total FROM transacciones WHERE descripcion LIKE '%Ahorro%'");
            const [gastos] = await db.query("SELECT SUM(monto) as total FROM transacciones WHERE tipo = 'GASTO' AND MONTH(fecha) = MONTH(DATE_SUB(NOW(), INTERVAL 5 HOUR))");
            // ----------------------------------------
            // --- NUEVO: Pedimos los datos de la semana ---
            //const semana = await ViajeModel.obtenerGananciasUltimos7Dias();
            // ---------------------------------------------

            let semana = [];
            let estadisticas = [];
            try {
                // Intentamos obtener el gráfico
                if (ViajeModel.obtenerGananciasUltimos7Dias) {
                     semana = await ViajeModel.obtenerGananciasUltimos7Dias();
                }
                if (ViajeModel.obtenerEstadisticas) {
                    estadisticas = await ViajeModel.obtenerEstadisticas(req.query.periodo || 'mes');
                }
            } catch (err) {
                // Si falla, solo imprimimos el error en la consola del servidor
                // PERO NO DETENEMOS LA APP. Enviamos lista vacía.
                console.error("⚠️ Error calculando gráficos", err.message);
                semana = [];
                estadisticas=[];
            }
            // --------------------------------------------------
            // --- 3. NUEVO: PEDIMOS LA GANANCIA EXACTA DE HOY (PERÚ) ---
            const gananciaHoy = await ViajeModel.obtenerGananciaHoyPeru();
            // ----------------------------------------------------------
            res.json({
                success: true,
                data: {
                    meta_diaria: meta, // <--- NUEVO CAMPO
                    ganancia_hoy: gananciaHoy,
                    cuentas,
                    ahorro_total: ahorro[0].total || 0,
                    gasto_mensual: gastos[0].total || 0,
                    estadisticas,
                    semana // Enviamos los datos filtrados
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error finanzas' });
        }
    }

    static async actualizarMeta(req, res) {
        try {
            const { nueva_meta } = req.body;
            // Actualizamos la meta del usuario 1 (Admin)
            await db.query("UPDATE usuarios SET meta_diaria = ? WHERE id = 1", [nueva_meta]);
            res.json({ success: true, message: "Meta actualizada" });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Error al actualizar meta" });
        }
    }

    static async registrarTransaccion(req, res) {
        try {
            const { tipo, monto, descripcion } = req.body;
            
            // Insertar en tabla transacciones
            // Asegúrate de que tu tabla tenga las columnas: tipo, monto, descripcion, fecha
            await db.query("INSERT INTO transacciones (tipo, monto, descripcion, fecha) VALUES (?, ?, ?, NOW())", 
                [tipo, monto, descripcion]);

            // Descontar o sumar a la CAJA CHICA (Efectivo) si es necesario
            // Por simplicidad, asumimos que los gastos salen del EFECTIVO
            if (tipo === 'GASTO') {
                await db.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE nombre = 'Efectivo'", [monto]);
            }

            res.json({ success: true, message: 'Registrado' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al registrar' });
        }
    }

    // Acción: Mover dinero entre cuentas
    static async realizarTransferencia(req, res) {
        try {
            const { cuenta_origen_id, cuenta_destino_id, monto, nota } = req.body;

            if (!monto || monto <= 0) {
                return res.json({ success: false, message: "Monto inválido" });
            }

            // 1. Restar del Origen
            await db.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?", [monto, cuenta_origen_id]);

            // 2. Sumar al Destino
            await db.query("UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = ?", [monto, cuenta_destino_id]);

            // 3. Registrar el movimiento
            await db.query(`
                INSERT INTO transacciones (tipo, monto, descripcion, fecha) 
                VALUES ('TRANSFERENCIA', ?, ?, NOW())
            `, [monto, `Transferencia: ${nota}`]);

            res.json({ success: true, message: "Transferencia exitosa" });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Error en transferencia" });
        }
    }
}

module.exports = FinanzasController;