const db = require('../config/db');

class FinanzasModel {

    // ==========================================
    // 1. DASHBOARD Y BILLETERA
    // ==========================================
    static async obtenerMetaUsuario(idUsuario) {
        const [rows] = await db.query("SELECT meta_diaria FROM usuarios WHERE id = ?", [idUsuario]);
        return rows[0]?.meta_diaria || 200;
    }

    static async actualizarMetaUsuario(idUsuario, nuevaMeta) {
        const [result] = await db.query("UPDATE usuarios SET meta_diaria = ? WHERE id = ?", [nuevaMeta, idUsuario]);
        return result.affectedRows > 0;
    }

    static async obtenerTotalAhorro() {
        const [rows] = await db.query("SELECT SUM(monto) as total FROM transacciones WHERE descripcion LIKE '%Ahorro%'");
        return rows[0]?.total || 0;
    }

    static async obtenerGastoMensual() {
        const [rows] = await db.query(`
            SELECT SUM(monto) as total FROM transacciones 
            WHERE tipo = 'GASTO' 
            AND MONTH(DATE_SUB(fecha, INTERVAL 5 HOUR)) = MONTH(DATE_SUB(NOW(), INTERVAL 5 HOUR))
        `);
        return rows[0]?.total || 0;
    }

    static async listarUltimosMovimientos(limite = 15) {
        const [rows] = await db.query(`
            SELECT t.id, t.tipo, t.monto, t.descripcion, t.fecha, t.categoria, c.nombre as nombre_cuenta,
            DATE_FORMAT(DATE_SUB(t.fecha, INTERVAL 5 HOUR), '%d/%m %h:%i %p') as fecha_fmt 
            FROM transacciones t
            LEFT JOIN cuentas c ON t.cuenta_id = c.id
            ORDER BY t.id DESC LIMIT ?
        `, [limite]);
        return rows;
    }

    // ==========================================
    // 2. TRANSACCIONES
    // ==========================================
    static async registrarTransaccionSimple(datos) {
        const { tipo, monto, descripcion, ambito, categoria, cuenta_id, obligacion_id } = datos;
        
        await db.query(`
            INSERT INTO transacciones (tipo, monto, descripcion, ambito, categoria, cuenta_id, obligacion_id, fecha) 
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `, [tipo, monto, descripcion, ambito || 'TAXI', categoria || 'General', cuenta_id || 1, obligacion_id || null]);

        if (cuenta_id) {
            const operador = tipo === 'INGRESO' ? '+' : '-';
            await db.query(`UPDATE cuentas SET saldo_actual = saldo_actual ${operador} ? WHERE id = ?`, [monto, cuenta_id]);
        }
        return true;
    }

    static async registrarTransferenciaCompleja(origenId, destinoId, monto, nota) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. AJUSTAR SALDOS (Matemática pura - Esto se mantiene igual)
            // Restamos a la cuenta origen
            await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?", [monto, origenId]);
            // Sumamos a la cuenta destino
            await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = ?", [monto, destinoId]);

            // 2. OBTENER NOMBRES (Para describir mejor la operación)
            const [destRows] = await connection.query("SELECT nombre FROM cuentas WHERE id = ?", [destinoId]);
            const [origRows] = await connection.query("SELECT nombre FROM cuentas WHERE id = ?", [origenId]);
            const nomDest = destRows[0]?.nombre || 'Destino';
            const nomOrig = origRows[0]?.nombre || 'Origen';

            // =================================================================================
            // 3. REGISTRO CONTABLE (AQUÍ ESTÁ LA CORRECCIÓN) ✅
            // Usamos 'TRANSFERENCIA' en tipo y 'PERSONAL' en ambito para ambos movimientos.
            // Diferenciamos entrada/salida usando la CATEGORÍA.
            // =================================================================================

            // A) REGISTRO DE SALIDA (Para la cuenta Origen) -> RESTA
            await connection.query(`
                INSERT INTO transacciones 
                (tipo, monto, descripcion, cuenta_id, fecha, categoria, ambito) 
                VALUES ('TRANSFERENCIA', ?, ?, ?, NOW(), 'Transferencia Salida', 'PERSONAL')
            `, [monto, `Transferencia a ${nomDest}: ${nota}`, origenId]);

            // B) REGISTRO DE ENTRADA (Para la cuenta Destino) -> SUMA
            await connection.query(`
                INSERT INTO transacciones 
                (tipo, monto, descripcion, cuenta_id, fecha, categoria, ambito) 
                VALUES ('TRANSFERENCIA', ?, ?, ?, NOW(), 'Transferencia Entrada', 'PERSONAL')
            `, [monto, `Recibido de ${nomOrig}: ${nota}`, destinoId]);

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    
    static async registrarGastoRapido(monto, categoria, nota) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            const cuentaId = 1; // Efectivo (Bolsillo)

            // 1. Restar dinero
            await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?", [monto, cuentaId]);

            // 2. Insertar movimiento
            // IMPORTANTE:
            // - Tabla: 'transacciones' (No movimientos)
            // - Tipo: 'GASTO' (No EGRESO, según tu base de datos)
            // - Columna Descripción: Recibe la variable 'nota'
            // - Ambito: 'TAXI'
            await connection.query(`
                INSERT INTO transacciones (cuenta_id, tipo, monto, categoria, descripcion, fecha, ambito) 
                VALUES (?, 'GASTO', ?, ?, ?, NOW(), 'TAXI')
            `, [cuentaId, monto, categoria, nota || categoria]);

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // ==========================================
    // 3. OBLIGACIONES Y COMPROMISOS (Lógica Compleja)
    // ==========================================
    static async listarObligacionesPendientes() {
        const [rows] = await db.query(`
            SELECT *, DATEDIFF(fecha_vencimiento, NOW()) as dias_restantes 
            FROM obligaciones WHERE estado = 'PENDIENTE' ORDER BY fecha_vencimiento ASC
        `);
        return rows;
    }

    static async crearObligacion(titulo, monto, fecha, prioridad) {
        const [result] = await db.query(`
            INSERT INTO obligaciones (titulo, monto, fecha_vencimiento, prioridad, estado)
            VALUES (?, ?, ?, ?, 'PENDIENTE')
        `, [titulo, monto, fecha, prioridad]);
        return result.insertId;
    }

    // Aquí moví toda la lógica de generación de fechas para mantener el Controller limpio
    static async crearCompromisoCompleto(datos) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const { titulo, tipo, monto_total, monto_cuota, cuotas_totales, dia_pago, warda_origen_id } = datos;
            const diaPagoInt = parseInt(dia_pago); 

            // 1. Crear PADRE
            const [resCompromiso] = await connection.query(`
                INSERT INTO compromisos (titulo, tipo, monto_total, monto_cuota_aprox, cuotas_totales, dia_pago_mensual, origen_sugerido_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [titulo, tipo, monto_total, monto_cuota, cuotas_totales, diaPagoInt, warda_origen_id || null]);
            
            const compromisoId = resCompromiso.insertId;

            // 2. Generar HIJOS (Cronograma)
            const numCuotasAGenerar = cuotas_totales || 12;
            let fechaBase = new Date(); 
            const diaHoy = fechaBase.getDate();

            if (diaHoy > diaPagoInt) fechaBase.setMonth(fechaBase.getMonth() + 1);
            fechaBase.setDate(diaPagoInt); 

            const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

            for (let i = 0; i < numCuotasAGenerar; i++) {
                let fechaCuota = new Date(fechaBase);
                fechaCuota.setMonth(fechaBase.getMonth() + i);
                
                const fechaSQL = fechaCuota.toISOString().split('T')[0];
                let tituloCuota = "";

                if (tipo === 'SERVICIO_FIJO') {
                    const nombreMes = nombresMeses[fechaCuota.getMonth()];
                    const anio = fechaCuota.getFullYear();
                    tituloCuota = `${titulo} - ${nombreMes} ${anio}`;
                } else {
                    tituloCuota = `${titulo} - Cuota ${i + 1}/${numCuotasAGenerar}`;
                }

                await connection.query(`
                    INSERT INTO obligaciones (compromiso_id, titulo, monto, fecha_vencimiento, prioridad, estado)
                    VALUES (?, ?, ?, ?, 'NORMAL', 'PENDIENTE')
                `, [compromisoId, tituloCuota, monto_cuota, fechaSQL]);
            }

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async listarCompromisosActivos() {
        const [rows] = await db.query("SELECT * FROM compromisos WHERE estado = 'ACTIVO' ORDER BY id DESC");
        return rows;
    }

    static async cancelarCompromiso(id) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            await connection.query("UPDATE compromisos SET estado = 'CANCELADO' WHERE id = ?", [id]);
            const [resDelete] = await connection.query("DELETE FROM obligaciones WHERE compromiso_id = ? AND estado = 'PENDIENTE'", [id]);

            await connection.commit();
            return resDelete.affectedRows;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async pagarObligacion(idObligacion, idCuentaOrigen, monto) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = ?", [monto, idCuentaOrigen]);
            await connection.query("UPDATE obligaciones SET estado = 'PAGADO', fecha_pago = NOW() WHERE id = ?", [idObligacion]);
            
            await connection.query(`
                INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, obligacion_id, fecha, ambito) 
                VALUES ('PAGO_DEUDA', ?, 'Pago de Obligación', ?, ?, NOW(), 'PERSONAL')
            `, [monto, idCuentaOrigen, idObligacion]);

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // ==========================================
    // 4. ESTADÍSTICAS Y CIERRE
    // ==========================================
    static async obtenerSugerenciaReparto() {
        // Ingresos de Viajes HOY
        const [ingresos] = await db.query(`
            SELECT SUM(monto_cobrado) as total FROM viajes 
            WHERE estado = 'COMPLETADO' AND DATE(fecha_hora_fin) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
        `);
        // Gastos Operativos HOY
        const [gastos] = await db.query(`
            SELECT SUM(monto) as total FROM transacciones 
            WHERE tipo = 'GASTO' AND categoria NOT IN ('Anulación Carrera') 
            AND DATE(DATE_SUB(fecha, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))
        `);
        
        return { 
            ingresos: ingresos[0].total || 0, 
            gastos: gastos[0].total || 0 
        };
    }

    static async obtenerEstadisticasGastos(desde, hasta) {
        let filtroSQL = "";
        let parametros = [];

        if (desde && hasta) {
            filtroSQL = "AND fecha BETWEEN ? AND ?";
            parametros = [`${desde} 00:00:00`, `${hasta} 23:59:59`];
        } else {
            filtroSQL = "AND MONTH(fecha) = MONTH(CURRENT_DATE()) AND YEAR(fecha) = YEAR(CURRENT_DATE())";
        }

        const query = `SELECT categoria, SUM(monto) as total FROM transacciones WHERE tipo = 'GASTO' ${filtroSQL} GROUP BY categoria`;
        const [rows] = await db.query(query, parametros);
        return rows;
    }

    static async obtenerDatosCierre() {
        const [rows1] = await db.query("SELECT saldo_actual FROM cuentas WHERE id = 1");
        const [rows2] = await db.query("SELECT saldo_actual FROM cuentas WHERE id = 2");
        
        // Totales de Transacciones HOY (para calcular arqueo)
        const [ing] = await db.query(`SELECT SUM(monto) as total FROM transacciones WHERE tipo = 'INGRESO' AND DATE(DATE_SUB(fecha, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))`);
        const [gas] = await db.query(`SELECT SUM(monto) as total FROM transacciones WHERE tipo = 'GASTO' AND DATE(DATE_SUB(fecha, INTERVAL 5 HOUR)) = DATE(DATE_SUB(NOW(), INTERVAL 5 HOUR))`);

        return {
            saldo_efectivo: parseFloat(rows1[0]?.saldo_actual || 0),
            saldo_yape: parseFloat(rows2[0]?.saldo_actual || 0),
            ingresos_hoy: ing[0].total || 0,
            gastos_hoy: gas[0].total || 0
        };
    }

    static async procesarAjusteCaja(diferencia) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const monto = Math.abs(diferencia);

            if (diferencia < 0) { // Falta
                await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual - ? WHERE id = 1", [monto]);
                await connection.query(`INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, categoria, fecha) VALUES ('GASTO', ?, 'Ajuste (Faltante)', 1, 'Descuadre', NOW())`, [monto]);
            } else { // Sobra
                await connection.query("UPDATE cuentas SET saldo_actual = saldo_actual + ? WHERE id = 1", [monto]);
                await connection.query(`INSERT INTO transacciones (tipo, monto, descripcion, cuenta_id, categoria, fecha) VALUES ('INGRESO', ?, 'Ajuste (Sobrante)', 1, 'Otros Ingresos', NOW())`, [monto]);
            }

            await connection.commit();
            return true;
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }
    }

    // ==========================================
    // 5. UTILITARIOS (MOVIDO DEL CONTROLLER)
    // ==========================================
    static async obtenerCuentasActivas() {
        // Esta query antes estaba en el Controller. Ahora vive aquí.
        const [rows] = await db.query("SELECT id, nombre, saldo_actual, tipo FROM cuentas WHERE activo = 1 ORDER BY id ASC");
        return rows;
    }
}

module.exports = FinanzasModel;