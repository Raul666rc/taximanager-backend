// UBICACIÓN: src/controllers/AuthController.js
const db = require('../config/db');

class AuthController {
    
    static async login(req, res) {
        try {
            const { username, password } = req.body;

            // Buscamos al usuario
            // Nota: En un futuro, aquí deberíamos encriptar la contraseña, 
            // pero para tu uso personal funciona bien así.
            const query = "SELECT * FROM usuarios WHERE username = ? AND password = ?";
            const [rows] = await db.query(query, [username, password]);

            if (rows.length > 0) {
                // ¡Éxito! Devolvemos los datos del usuario
                res.json({ 
                    success: true, 
                    user: { 
                        id: rows[0].id, 
                        nombre: rows[0].nombre,
                        // AGREGADO: Enviamos la meta para que la App la sepa al instante
                        meta_diaria: rows[0].meta_diaria || 200 
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