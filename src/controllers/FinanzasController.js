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

            // --- NUEVO: 4. ÚLTIMOS MOVIMIENTOS (HISTORIAL) ---
            const [movimientos] = await db.query(`
                SELECT id, tipo, monto, descripcion, DATE_FORMAT(DATE_SUB(fecha, INTERVAL 5 HOUR), '%d/%m %h:%i %p') as fecha_fmt 
                FROM transacciones 
                ORDER BY id DESC 
                LIMIT 15
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
                    movimientos,
                    estadisticas,
                    semana
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error finanzas' });
        }
    }

    // Actualizar Meta Diaria
    static async actualizarMeta(req, res) {
        try {
            const { meta } = req.body;
            if (!meta) return res.status(400).json({ error: 'Falta meta' });

            // Asumimos usuario ID 1
            await db.query("UPDATE usuarios SET meta_diaria = ? WHERE id = 1", [meta]);
            
            res.json({ success: true, message: 'Meta actualizada' });
        } catch (e) {
            res.status(500).json({ error: e.message });
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

    // Crear Compromiso (Préstamo o Servicio Recurrente)
    static async crearCompromiso(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const { 
                titulo, tipo, monto_total, monto_cuota, 
                cuotas_totales, dia_pago, warda_origen_id 
            } = req.body;

            // Aseguramos que el día sea entero
            const diaPagoInt = parseInt(dia_pago); 

            // 1. Crear PADRE
            const [resCompromiso] = await connection.query(`
                INSERT INTO compromisos 
                (titulo, tipo, monto_total, monto_cuota_aprox, cuotas_totales, dia_pago_mensual, origen_sugerido_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [titulo, tipo, monto_total, monto_cuota, cuotas_totales, diaPagoInt, warda_origen_id || null]);
            
            const compromisoId = resCompromiso.insertId;

            // 2. Generar HIJOS (Cronograma)
            const numCuotasAGenerar = cuotas_totales || 12;

            // A. Determinamos fecha inicio
            let fechaBase = new Date(); 
            const diaHoy = fechaBase.getDate();

            // Lógica de fechas corregida con enteros
            if (diaHoy > diaPagoInt) {
                fechaBase.setMonth(fechaBase.getMonth() + 1);
            }
            // Importante: setDate puede fallar si ponemos 31 en febrero, 
            // pero JS lo corrige automáticamente al siguiente mes válido.
            fechaBase.setDate(diaPagoInt); 

            const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

            for (let i = 0; i < numCuotasAGenerar; i++) {
                let fechaCuota = new Date(fechaBase);
                fechaCuota.setMonth(fechaBase.getMonth() + i);
                
                const fechaSQL = fechaCuota.toISOString().split('T')[0];
                let tituloCuota = "";

                if (tipo === 'SERVICIO_FIJO') {
                    // Formato: "Netflix - Ene 2026"
                    const nombreMes = nombresMeses[fechaCuota.getMonth()];
                    const anio = fechaCuota.getFullYear();
                    tituloCuota = `${titulo} - ${nombreMes} ${anio}`;
                } else {
                    // Formato: "Préstamo - Cuota 1/24"
                    tituloCuota = `${titulo} - Cuota ${i + 1}/${numCuotasAGenerar}`;
                }

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
            console.error("Error backend:", error); // Ver el error real en consola
            res.status(500).json({ success: false, message: error.message || "Error al generar el compromiso" });
        } finally {
            connection.release();
        }
    }

    // LISTAR CONTRATOS ACTIVOS
    static async listarCompromisos(req, res) {
        try {
            const query = `
                SELECT * FROM compromisos 
                WHERE estado = 'ACTIVO' 
                ORDER BY id DESC
            `;
            const [rows] = await db.query(query);
            res.json({ success: true, data: rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Error al listar contratos" });
        }
    }

    // DAR DE BAJA (CANCELAR SERVICIO/PRÉSTAMO)
    static async cancelarCompromiso(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            const { id } = req.body; // ID del Compromiso (Padre)

            // 1. Marcar el Papá como CANCELADO
            await connection.query(
                "UPDATE compromisos SET estado = 'CANCELADO' WHERE id = ?", 
                [id]
            );

            // 2. Eliminar los HIJOS (Cuotas) que estén PENDIENTES
            // OJO: No borramos las que ya pagaste (historial), solo las futuras.
            const [resDelete] = await connection.query(
                "DELETE FROM obligaciones WHERE compromiso_id = ? AND estado = 'PENDIENTE'",
                [id]
            );

            await connection.commit();
            
            res.json({ 
                success: true, 
                message: `Servicio cancelado. Se eliminaron ${resDelete.affectedRows} cuotas futuras.` 
            });

        } catch (error) {
            await connection.rollback();
            console.error(error);
            res.status(500).json({ success: false, message: "Error al cancelar contrato" });
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

    // ==========================================
    //  REPARTO
    // ==========================================
    // Acción: Calcular el monto sugerido para el reparto (Cierre del día)
    static async obtenerSugerenciaReparto(req, res) {
        try {
            // 1. Sumamos todos los viajes completados de HOY (Hora Perú)
            const [ingresos] = await db.query(`
                SELECT SUM(monto_cobrado) as total 
                FROM viajes 
                WHERE estado = 'COMPLETADO' 
                AND DATE(fecha_hora_fin) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `);

            // 2. Sumamos los gastos operativos de HOY (Gasolina, Menu, etc)
            // OJO: Excluimos 'TRANSFERENCIA' y 'PAGO_DEUDA' para no duplicar restas
            const [gastos] = await db.query(`
                SELECT SUM(monto) as total 
                FROM transacciones 
                WHERE tipo = 'GASTO' 
                AND categoria NOT IN ('Anulación Carrera') 
                AND DATE(DATE_SUB(fecha, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `);

            const totalIngresos = ingresos[0].total || 0;
            const totalGastos = gastos[0].total || 0;
            
            // La ganancia neta real del día
            const neto = totalIngresos - totalGastos;

            res.json({
                success: true,
                data: {
                    ingresos: totalIngresos,
                    gastos: totalGastos,
                    sugerido: neto > 0 ? neto : 0 // Si es negativo, sugerimos 0
                }
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Error al calcular reparto" });
        }
    }

    // Obtener lista de todas las cuentas con sus saldos
    static async listarCuentas(req, res) {
        try {
            const [rows] = await db.query("SELECT id, nombre_cuenta, saldo_actual FROM cuentas");
            res.json({ success: true, data: rows });
        } catch (error) {
            res.status(500).json({ success: false, message: "Error" });
        }
    }
    
    // ==========================================
    // 3. ESTADÍSTICAS
    // ==========================================
    // Obtener desglose de gastos para el gráfico
    // ==========================================
    // 3. ESTADÍSTICAS (MODIFICADO PARA FILTROS)
    // ==========================================
    static async obtenerEstadisticasGastos(req, res) {
        try {
            // 1. Recibimos las fechas de la URL (si existen)
            const { desde, hasta } = req.query;
            
            let filtroSQL = "";
            let parametros = [];

            // 2. Decidimos qué filtro aplicar
            if (desde && hasta) {
                // CASO A: Rango personalizado (Hoy, Ayer, Semana...)
                filtroSQL = "AND fecha BETWEEN ? AND ?";
                // Agregamos horas para cubrir el día completo
                parametros = [`${desde} 00:00:00`, `${hasta} 23:59:59`];
            } else {
                // CASO B: Por defecto (Mes Actual) si no envían fechas
                filtroSQL = "AND MONTH(fecha) = MONTH(CURRENT_DATE()) AND YEAR(fecha) = YEAR(CURRENT_DATE())";
            }

            // 3. Consulta SQL Dinámica
            const query = `
                SELECT categoria, SUM(monto) as total 
                FROM transacciones 
                WHERE tipo = 'GASTO' 
                ${filtroSQL}
                GROUP BY categoria
            `;
            
            const [rows] = await db.query(query, parametros);
            
            // 4. Formato para Chart.js
            const labels = rows.map(r => r.categoria);
            const data = rows.map(r => r.total);

            res.json({ success: true, labels, data });

        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }

    // ==========================================
    // 4. CIERRE DE CAJA (NUEVO MÓDULO)
    // ==========================================

    // A. Obtener datos para el arqueo
    static async obtenerDatosCierre(req, res) {
        try {
            // 1. Saldos Totales
            const [rows1] = await db.query("SELECT saldo_actual FROM cuentas WHERE id = 1"); // Efectivo
            const [rows2] = await db.query("SELECT saldo_actual FROM cuentas WHERE id = 2"); // Yape
            
            const saldoEfectivo = parseFloat(rows1[0]?.saldo_actual || 0);
            const saldoYape = parseFloat(rows2[0]?.saldo_actual || 0);

            // 2. Movimientos de HOY (Para calcular la "Base de Ayer")
            // Ingresos Hoy (Efectivo + Yape)
            const [ing] = await db.query(`
                SELECT SUM(monto) as total FROM transacciones 
                WHERE tipo = 'INGRESO' 
                AND DATE(DATE_SUB(fecha, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `);
            
            // Gastos Hoy (Efectivo + Yape) - Excluyendo ajustes técnicos
            const [gas] = await db.query(`
                SELECT SUM(monto) as total FROM transacciones 
                WHERE tipo = 'GASTO' 
                AND DATE(DATE_SUB(fecha, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
            `);

            const ingresosHoy = parseFloat(ing[0].total || 0);
            const gastosHoy = parseFloat(gas[0].total || 0);

            res.json({
                success: true,
                saldo_efectivo: saldoEfectivo,
                saldo_yape: saldoYape,
                ingresos_hoy: ingresosHoy,
                gastos_hoy: gastosHoy
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: "Error al obtener datos" });
        }
    }

    // B. Procesar el Descuadre (Si falta o sobra plata)
    static async procesarAjusteCaja(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            const { diferencia } = req.body; // Puede ser negativo (falta plata) o positivo (sobra)
            
            // Si la diferencia es 0, no hacemos nada
            if (diferencia === 0) {
                await connection.release();
                return res.json({ success: true, message: "Caja cuadrada perfecta." });
            }

            if (diferencia < 0) {
                // FALTA PLATA -> Registramos un GASTO de ajuste
                const monto = Math.abs(diferencia);
                // 1. Restar saldo
                await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = 1", [monto]);
                // 2. Registrar transacción
                await connection.query(`
                    INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, categoria, fecha)
                    VALUES ('GASTO', ?, 'Ajuste de Cierre (Dinero faltante)', 1, 'Descuadre', NOW())
                `, [monto]);
            } else {
                // SOBRA PLATA -> Registramos un INGRESO de ajuste (ej: propinas olvidadas)
                const monto = diferencia;
                // 1. Sumar saldo
                await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = 1", [monto]);
                // 2. Registrar transacción
                await connection.query(`
                    INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, categoria, fecha)
                    VALUES ('INGRESO', ?, 'Ajuste de Cierre (Dinero sobrante)', 1, 'Otros Ingresos', NOW())
                `, [monto]);
            }

            await connection.commit();
            res.json({ success: true, message: "Ajuste registrado correctamente." });

        } catch (error) {
            await connection.rollback();
            console.error(error);
            res.status(500).json({ success: false, message: "Error al procesar ajuste" });
        } finally {
            connection.release();
        }
    }
}
    


module.exports = FinanzasController;