// UBICACIÓN: src/controllers/FinanzasController.js
const db = require('../config/db');
const ViajeModel = require('../models/ViajeModel');

class FinanzasController {

    // ==========================================
    // 1. DASHBOARD PRINCIPAL (BILLETERA)
    // ==========================================
    static async obtenerBilletera(req, res) {
        try {
            // Leemos el filtro de la URL (ej: ?periodo=semana)
            const periodo = req.query.periodo || 'mes';

            // 1. OBTENER META (Usuario Admin ID 1)
            const [userRows] = await db.query("SELECT meta_diaria FROM usuarios WHERE id = 1");
            const meta = userRows[0]?.meta_diaria || 200;

            // 2. SALDOS REALES
            const [cuentas] = await db.query("SELECT id, nombre, saldo_actual FROM cuentas"); // Agregué ID para el frontend

            // 3. AHORRO Y GASTOS (Cálculo rápido)
            const [ahorro] = await db.query("SELECT SUM(monto) as total FROM transacciones WHERE descripcion LIKE '%Ahorro%'");
            
            // Gastos del mes actual (ajustado a hora Perú)
            const [gastos] = await db.query(`
                SELECT SUM(monto) as total 
                FROM transacciones 
                WHERE tipo = 'GASTO' 
                AND MONTH(DATE_SUB(fecha, INTERVAL 5 HOUR)) = MONTH(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `);

            // 4. GRÁFICOS (Protegidos con try/catch para no tumbar la app si fallan)
            let semana = [];
            let estadisticas = [];
            try {
                if (ViajeModel.obtenerGananciasUltimos7Dias) {
                     semana = await ViajeModel.obtenerGananciasUltimos7Dias();
                }
                if (ViajeModel.obtenerEstadisticas) {
                    estadisticas = await ViajeModel.obtenerEstadisticas(periodo);
                }
            } catch (err) {
                console.error("⚠️ Error calculando gráficos", err.message);
            }

            // 5. GANANCIA HOY (Exacta Hora Perú)
            let gananciaHoy = 0;
            try {
                gananciaHoy = await ViajeModel.obtenerGananciaHoyPeru();
            } catch (e) { console.error(e); }

            res.json({
                success: true,
                data: {
                    meta_diaria: meta,
                    ganancia_hoy: gananciaHoy,
                    cuentas,
                    ahorro_total: ahorro[0]?.total || 0,
                    gasto_mensual: gastos[0]?.total || 0,
                    estadisticas,
                    semana
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
            await db.query("UPDATE usuarios SET meta_diaria = ? WHERE id = 1", [nueva_meta]);
            res.json({ success: true, message: "Meta actualizada" });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Error al actualizar meta" });
        }
    }

    // ==========================================
    // 2. TRANSACCIONES Y MOVIMIENTOS
    // ==========================================
    
    // Registrar Gasto o Ingreso Manual
    static async registrarTransaccion(req, res) {
        try {
            const { tipo, monto, descripcion, ambito, categoria, cuenta_id, obligacion_id } = req.body;
            
            if (!monto) return res.json({ success: false, message: "Falta monto" });

            // Insertamos la transacción
            const query = `
                INSERT INTO transacciones 
                (tipo, monto, descripcion, ambito, categoria, cuenta_id, obligacion_id, fecha) 
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `;
            
            await db.query(query, [
                tipo, 
                monto, 
                descripcion, 
                ambito || 'TAXI', 
                categoria || 'General', 
                cuenta_id || 1, 
                obligacion_id || null
            ]);

            // Si es GASTO, restamos saldo
            if (tipo === 'GASTO' && cuenta_id) {
                await db.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?", [monto, cuenta_id]);
            }
            // Si es INGRESO (manual), sumamos saldo
            if (tipo === 'INGRESO' && cuenta_id) {
                await db.query("UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = ?", [monto, cuenta_id]);
            }

            res.json({ success: true, message: 'Registrado' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al registrar' });
        }
    }

    // Mover dinero entre cuentas (MEJORADO CON TRANSACCIÓN SEGURA)
    static async realizarTransferencia(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction(); // Iniciamos modo seguro

            const { cuenta_origen_id, cuenta_destino_id, monto, nota } = req.body;

            if (!monto || monto <= 0) throw new Error("Monto inválido");

            // 1. Restar del Origen
            await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?", [monto, cuenta_origen_id]);

            // 2. Sumar al Destino
            await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = ?", [monto, cuenta_destino_id]);

            // 3. Registrar
            await connection.query(`
                INSERT INTO transacciones (tipo, monto, descripcion, fecha, categoria) 
                VALUES ('TRANSFERENCIA', ?, ?, NOW(), 'Movimiento Interno')
            `, [monto, `Transferencia: ${nota}`]);

            await connection.commit(); // Guardamos cambios
            res.json({ success: true, message: "Transferencia exitosa" });

        } catch (error) {
            await connection.rollback(); // Si falla, devolvemos el dinero
            console.error(error);
            res.status(500).json({ success: false, message: "Error en transferencia" });
        } finally {
            connection.release();
        }
    }

    // ==========================================
    // 3. OBLIGACIONES Y COMPROMISOS (Deudas)
    // ==========================================

    // Listar lo pendiente
    static async obtenerObligaciones(req, res) {
        try {
            const query = `
                SELECT *, 
                DATEDIFF(fecha_vencimiento, NOW()) as dias_restantes 
                FROM obligaciones 
                WHERE estado = 'PENDIENTE'
                ORDER BY fecha_vencimiento ASC
            `;
            const [rows] = await db.query(query);
            res.json({ success: true, data: rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Error al listar obligaciones" });
        }
    }

    // Crear obligación simple (Gasto único / Inoportuno)
    static async crearObligacion(req, res) {
        try {
            const { titulo, monto, fecha, prioridad } = req.body;
            
            // CORRECCIÓN: Quitamos 'origen_sugerido_id' y 'warda_id' porque esa columna 
            // no existe en la tabla 'obligaciones' del script V3.0.
            // Solo insertamos los datos básicos.
            
            await db.query(`
                INSERT INTO obligaciones (titulo, monto, fecha_vencimiento, prioridad, estado)
                VALUES (?, ?, ?, ?, 'PENDIENTE')
            `, [titulo, monto, fecha, prioridad]);

            res.json({ success: true, message: "Obligación registrada" });
            
        } catch (error) {
            console.error("Error SQL Obligaciones:", error); // Esto imprimirá el error real en los logs
            // Devolvemos el mensaje técnico para que sepas qué pasó si vuelve a fallar
            res.status(500).json({ success: false, message: "Error al crear obligación: " + error.message });
        }
    }

    static async crearCompromiso(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const { 
                titulo, tipo, monto_total, monto_cuota, 
                cuotas_totales, dia_pago, warda_origen_id 
            } = req.body;

            // 1. Crear PADRE
            const [resCompromiso] = await connection.query(`
                INSERT INTO compromisos 
                (titulo, tipo, monto_total, monto_cuota_aprox, cuotas_totales, dia_pago_mensual, origen_sugerido_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [titulo, tipo, monto_total, monto_cuota, cuotas_totales, dia_pago, warda_origen_id]);
            
            const compromisoId = resCompromiso.insertId;

            // 2. Generar HIJOS (Cuotas) - LÓGICA CORREGIDA
            const numCuotasAGenerar = cuotas_totales || 1; 

            // A. Determinamos la fecha de la PRIMERA cuota
            let fechaBase = new Date(); // Hoy
            const diaHoy = fechaBase.getDate();

            // Si hoy es 11 y el pago es el 20 -> Pagas este mes (No sumamos mes)
            // Si hoy es 25 y el pago es el 20 -> Ya pasó, pagas el próximo mes (Sumamos 1 mes)
            if (diaHoy > dia_pago) {
                fechaBase.setMonth(fechaBase.getMonth() + 1);
            }
            
            // Fijamos el día de pago
            fechaBase.setDate(dia_pago);

            for (let i = 0; i < numCuotasAGenerar; i++) {
                // Clonamos la fecha base para no alterarla
                let fechaCuota = new Date(fechaBase);
                // Sumamos 'i' meses (0 para la primera, 1 para la segunda, etc.)
                fechaCuota.setMonth(fechaBase.getMonth() + i);
                
                const fechaSQL = fechaCuota.toISOString().split('T')[0];
                
                // Mejoramos el título: "Préstamo Auto - Cuota 1/12"
                const tituloCuota = cuotas_totales 
                    ? `${titulo} - Cuota ${i + 1}/${cuotas_totales}` 
                    : `${titulo} - Mensualidad ${i + 1}`;

                await connection.query(`
                    INSERT INTO obligaciones 
                    (compromiso_id, titulo, monto, fecha_vencimiento, prioridad, estado)
                    VALUES (?, ?, ?, ?, 'NORMAL', 'PENDIENTE')
                `, [compromisoId, tituloCuota, monto_cuota, fechaSQL]);
            }

            await connection.commit();
            res.json({ success: true, message: "Cronograma generado correctamente" });

        } catch (error) {
            await connection.rollback();
            console.error(error);
            res.status(500).json({ success: false, message: "Error al crear compromiso" });
        } finally {
            connection.release();
        }
    }

    // Pagar una Obligación (Cierra la deuda y resta dinero)
    static async pagarObligacion(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const { id_obligacion, id_cuenta_origen, monto } = req.body;

            // 1. Restar Dinero
            await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?", [monto, id_cuenta_origen]);

            // 2. Marcar Pagado
            await connection.query("UPDATE obligaciones SET estado = 'PAGADO', fecha_pago = NOW() WHERE id = ?", [id_obligacion]);

            // 3. Registrar Transacción
            await connection.query(`
                INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, obligacion_id, fecha, ambito) 
                VALUES ('PAGO_DEUDA', ?, 'Pago de Obligación', ?, ?, NOW(), 'PERSONAL')
            `, [monto, id_cuenta_origen, id_obligacion]);

            await connection.commit();
            res.json({ success: true, message: "Pago realizado correctamente" });

        } catch (error) {
            await connection.rollback();
            console.error(error);
            res.status(500).json({ success: false, message: "Error al procesar pago" });
        } finally {
            connection.release();
        }
    }
}

module.exports = FinanzasController;