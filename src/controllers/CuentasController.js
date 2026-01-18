const CuentasModel = require('../models/CuentasModel');

class CuentasController {

    // Listar para el Administrador
    static async listarCuentas(req, res) {
        try {
            const cuentas = await CuentasModel.obtenerTodas();
            res.json({ success: true, data: cuentas });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    // Guardar (Crear o Editar)
    static async guardarCuenta(req, res) {
        try {
            const { id, nombre, tipo } = req.body;

            if (id) {
                // Si viene ID, es EDICIÓN
                await CuentasModel.editar(id, nombre);
                res.json({ success: true, message: "Cuenta actualizada" });
            } else {
                // Si no viene ID, es CREACIÓN
                if (!nombre || !tipo) return res.status(400).json({ success: false, message: "Faltan datos" });
                await CuentasModel.crear(nombre, tipo);
                res.json({ success: true, message: "Cuenta creada" });
            }
        } catch (e) {
            res.status(500).json({ success: false, message: "Error al guardar" });
        }
    }

    // Toggle (Prender/Apagar)
    static async toggleEstado(req, res) {
        try {
            const { id, activo } = req.body; // activo viene como 1 o 0
            await CuentasModel.cambiarEstado(id, activo);
            res.json({ success: true, message: "Estado actualizado" });
        } catch (e) {
            res.status(500).json({ success: false });
        }
    }
}

module.exports = CuentasController;