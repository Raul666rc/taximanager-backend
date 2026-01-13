// UBICACIÓN: src/controllers/AuthController.js
const UsuarioModel = require('../models/UsuarioModel');

class AuthController {

    static async login(req, res) {
        try {
            const { username, password } = req.body;

            // 1. Validar que enviaron datos
            if (!username || !password) {
                return res.status(400).json({ success: false, message: 'Faltan credenciales' });
            }

            // 2. Consultar al Modelo
            const usuario = await UsuarioModel.verificarCredenciales(username, password);

            if (usuario) {
                // --- ÉXITO ---
                res.json({ 
                    success: true, 
                    message: 'Bienvenido',
                    user: { 
                        id: usuario.id, 
                        nombre: usuario.username 
                    } 
                });
            } else {
                // --- ERROR DE CREDENCIALES ---
                res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
            }

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error interno del servidor' });
        }
    }
}

module.exports = AuthController;