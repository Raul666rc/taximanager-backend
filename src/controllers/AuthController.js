// src/controllers/AuthController.js
const db = require('../config/db');

class AuthController {
    
    static async login(req, res) {
        try {
            const { username, password } = req.body;

            // Buscamos al usuario
            const query = "SELECT * FROM usuarios WHERE username = ? AND password = ?";
            const [rows] = await db.query(query, [username, password]);

            if (rows.length > 0) {
                // ¡Éxito! Devolvemos los datos del usuario
                res.json({ 
                    success: true, 
                    user: { 
                        id: rows[0].id, 
                        nombre: rows[0].nombre 
                    } 
                });
            } else {
                // Falló
                res.status(401).json({ success: false, message: 'Usuario o clave incorrectos' });
            }

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: 'Error en el servidor' });
        }
    }
}

module.exports = AuthController;