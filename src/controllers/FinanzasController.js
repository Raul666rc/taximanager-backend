const FinanzasModel = require('../models/FinanzasModel');
const ViajeModel = require('../models/ViajeModel');
// const db = ...  <-- ¡ELIMINADO! Ya no lo necesitamos aquí.

class FinanzasController {

    // ==========================================
    // 1. DASHBOARD PRINCIPAL (BILLETERA)
    // ==========================================
    static async obtenerBilletera(req, res) {
        try {
            const periodo = req.query.periodo || 'mes';

            // 1. Pedimos TODO al Modelo (Cero SQL aquí)
            const meta = await FinanzasModel.obtenerMetaUsuario(1);
            const ahorro = await FinanzasModel.obtenerTotalAhorro();
            const gastoMensual = await FinanzasModel.obtenerGastoMensual();
            const movimientos = await FinanzasModel.listarUltimosMovimientos(15);
            
            // 2. CORRECCIÓN: Usamos el método del Modelo en lugar de db.query
            const cuentas = await FinanzasModel.obtenerCuentasActivas();

            // 3. Gráficos (ViajeModel)
            let semana = [], estadisticas = [], gananciaHoy = 0;
            try {
                if (ViajeModel.obtenerGananciasUltimos7Dias) semana = await ViajeModel.obtenerGananciasUltimos7Dias();
                if (ViajeModel.obtenerEstadisticas) estadisticas = await ViajeModel.obtenerEstadisticas(periodo);
                gananciaHoy = await ViajeModel.obtenerGananciaHoyPeru();
            } catch (err) { console.error("Error gráficos", err); }

            res.json({
                success: true,
                data: {
                    meta_diaria: meta,
                    ganancia_hoy: gananciaHoy,
                    cuentas,
                    ahorro_total: ahorro,
                    gasto_mensual: gastoMensual,
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

    static async actualizarMeta(req, res) {
        try {
            const { meta } = req.body;
            if (!meta) return res.status(400).json({ error: 'Falta meta' });
            await FinanzasModel.actualizarMetaUsuario(1, meta);
            res.json({ success: true, message: 'Meta actualizada' });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }

    // ==========================================
    // 2. TRANSACCIONES
    // ==========================================
    static async registrarTransaccion(req, res) {
        try {
            if (!req.body.monto) return res.json({ success: false, message: "Falta monto" });
            await FinanzasModel.registrarTransaccionSimple(req.body);
            res.json({ success: true, message: 'Registrado' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error al registrar' });
        }
    }

    static async realizarTransferencia(req, res) {
        try {
            const { cuenta_origen_id, cuenta_destino_id, monto, nota } = req.body;
            if (!monto || monto <= 0) throw new Error("Monto inválido");

            await FinanzasModel.registrarTransferenciaCompleja(cuenta_origen_id, cuenta_destino_id, monto, nota);
            res.json({ success: true, message: "Transferencia exitosa" });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async listarMovimientos(req, res) {
        try {
            const rows = await FinanzasModel.listarUltimosMovimientos(20);
            res.json({ success: true, data: rows });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    static async registrarGastoRapido(req, res) {
        try {
            const { monto, categoria, nota } = req.body;
            if (!monto || monto <= 0) throw new Error("Monto inválido");
            await FinanzasModel.registrarGastoRapido(monto, categoria, nota);
            res.json({ success: true, message: "Gasto registrado" });
        } catch (error) { res.status(500).json({ success: false, message: "Error al registrar gasto" }); }
    }

    // ==========================================
    // 3. OBLIGACIONES Y COMPROMISOS
    // ==========================================
    static async obtenerObligaciones(req, res) {
        try {
            const rows = await FinanzasModel.listarObligacionesPendientes();
            res.json({ success: true, data: rows });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    static async crearObligacion(req, res) {
        try {
            const { titulo, monto, fecha, prioridad } = req.body;
            await FinanzasModel.crearObligacion(titulo, monto, fecha, prioridad);
            res.json({ success: true, message: "Obligación registrada" });
        } catch (error) { res.status(500).json({ success: false, message: error.message }); }
    }

    static async crearCompromiso(req, res) {
        try {
            await FinanzasModel.crearCompromisoCompleto(req.body);
            res.json({ success: true, message: "Cronograma generado correctamente" });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async listarCompromisos(req, res) {
        try {
            const rows = await FinanzasModel.listarCompromisosActivos();
            res.json({ success: true, data: rows });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    static async cancelarCompromiso(req, res) {
        try {
            const { id } = req.body;
            const cuotasBorradas = await FinanzasModel.cancelarCompromiso(id);
            res.json({ success: true, message: `Servicio cancelado. Se eliminaron ${cuotasBorradas} cuotas futuras.` });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    static async pagarObligacion(req, res) {
        try {
            const { id_obligacion, id_cuenta_origen, monto } = req.body;
            await FinanzasModel.pagarObligacion(id_obligacion, id_cuenta_origen, monto);
            res.json({ success: true, message: "Pago realizado correctamente" });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    // ==========================================
    // 4. UTILITARIOS, ESTADÍSTICAS Y CIERRE
    // ==========================================
    static async obtenerSugerenciaReparto(req, res) {
        try {
            const { ingresos, gastos } = await FinanzasModel.obtenerSugerenciaReparto();
            const neto = ingresos - gastos;
            res.json({ 
                success: true, 
                data: { ingresos, gastos, sugerido: neto > 0 ? neto : 0 } 
            });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    static async obtenerEstadisticasGastos(req, res) {
        try {
            const { desde, hasta } = req.query;
            const rows = await FinanzasModel.obtenerEstadisticasGastos(desde, hasta);
            const labels = rows.map(r => r.categoria);
            const data = rows.map(r => r.total);
            res.json({ success: true, labels, data });
        } catch (e) { res.status(500).json({ error: e.message }); }
    }

    static async obtenerDatosCierre(req, res) {
        try {
            const datos = await FinanzasModel.obtenerDatosCierre();
            res.json({ success: true, ...datos });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    static async procesarAjusteCaja(req, res) {
        try {
            const { diferencia } = req.body;
            if (diferencia === 0) return res.json({ success: true, message: "Caja cuadrada." });
            await FinanzasModel.procesarAjusteCaja(diferencia);
            res.json({ success: true, message: "Ajuste registrado." });
        } catch (error) { res.status(500).json({ success: false }); }
    }

    static async obtenerCuentas(req, res) {
        try {
            // CORRECCIÓN FINAL: Usamos el Modelo
            const rows = await FinanzasModel.obtenerCuentasActivas();
            res.json({ success: true, data: rows });
        } catch (error) { res.status(500).json({ success: false }); }
    }
}

module.exports = FinanzasController;