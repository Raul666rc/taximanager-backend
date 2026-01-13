// UBICACIÓN: src/models/UsuarioModel.js
const db = require('../config/db');

class UsuarioModel {

    // Buscar usuario por credenciales (Usuario y Contraseña)
    static async verificarCredenciales(username, password) {
        try {
            const query = "SELECT id, username, meta_diaria FROM usuarios WHERE username = ? AND password = ?";
            const [rows] = await db.query(query, [username, password]);
            
            // Si hay resultados, devolvemos el primer usuario encontrado
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = UsuarioModel;