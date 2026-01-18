const db = require('../config/db');

class VehiculoModel {

    // 1. OBTENER ESTADO COMPLETO (FUSIÓN)
    static async obtener() {
        // A. Datos Generales (Odómetro y Documentos)
        const [vehiculo] = await db.query("SELECT * FROM vehiculo WHERE id = 1");
        const datosAuto = vehiculo[0];

        if (!datosAuto) return null;

        // B. Lista de Partes (Aceite, Bujías, etc.)
        const [partes] = await db.query("SELECT * FROM mantenimientos");

        // C. Calculamos el estado de cada parte aquí mismo
        const kmActual = datosAuto.odometro_actual;
        
        const reportePartes = partes.map(p => {
            const proximoCambio = p.ultimo_cambio_km + p.frecuencia_km;
            const kmRestantes = proximoCambio - kmActual;
            
            // Vida útil (Invertido: 100% es nuevo, 0% es vencido)
            let porcentaje = (kmRestantes / p.frecuencia_km) * 100;
            if (porcentaje > 100) porcentaje = 100;
            if (porcentaje < 0) porcentaje = 0;

            // Estado para el color
            let estado = 'ok'; 
            if (kmRestantes <= 0) estado = 'vencido';
            else if (kmRestantes <= p.advertencia_km) estado = 'alerta';

            return {
                ...p, // trae id, nombre, icono...
                km_restantes: kmRestantes,
                porcentaje_vida: parseFloat(porcentaje.toFixed(0)),
                estado_visual: estado,
                proximo_cambio_calculado: proximoCambio
            };
        });

        // Retornamos un SUPER OBJETO con todo
        return {
            info: datosAuto,      // Odómetro, fechas SOAT...
            partes: reportePartes // Array con Aceite, Bujías, etc.
        };
    }

    // 2. Actualizar Odómetro (Igual que antes)
    static async actualizarOdometro(nuevoKm) {
        const query = "UPDATE vehiculo SET odometro_actual = ?, ultima_actualizacion = NOW() WHERE id = 1";
        const [result] = await db.query(query, [nuevoKm]);
        return result.affectedRows > 0;
    }

    // 3. Registrar Mantenimiento de UNA PARTE ESPECÍFICA (Nueva Lógica)
    static async realizarMantenimientoParte(idParte, kmAlMomentoDelCambio) {
        const query = "UPDATE mantenimientos SET ultimo_cambio_km = ? WHERE id = ?";
        const [result] = await db.query(query, [kmAlMomentoDelCambio, idParte]);
        return result.affectedRows > 0;
    }

    // 4. Actualizar Documentos (Igual que antes)
    static async actualizarDocumentos(soat, revision, gnv) {
        const query = "UPDATE vehiculo SET fecha_soat=?, fecha_revision=?, fecha_gnv=? WHERE id=1";
        const [result] = await db.query(query, [soat || null, revision || null, gnv || null]);
        return result.affectedRows > 0;
    }
}

module.exports = VehiculoModel;