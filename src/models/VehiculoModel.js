const db = require('../config/db');

class VehiculoModel {

    // 1. OBTENER TODO (Auto + Lista de Partes)
    static async obtener() {
        // A. Traemos datos principales (Odómetro, SOAT, Aceite Principal)
        const [vehiculo] = await db.query("SELECT * FROM vehiculo WHERE id = 1");
        const datosAuto = vehiculo[0];

        if (!datosAuto) return null;

        // B. Traemos la lista de partes (Caja, GLP, Bujías...)
        const [partes] = await db.query("SELECT * FROM mantenimientos");

        // C. Hacemos el cálculo matemático para CADA parte aquí mismo
        const kmActual = datosAuto.odometro_actual;
        
        const reportePartes = partes.map(p => {
            const proximoCambio = p.ultimo_cambio_km + p.frecuencia_km;
            const kmRestantes = proximoCambio - kmActual;
            
            // Vida útil (100% = Nuevo, 0% = Vencido)
            let porcentaje = (kmRestantes / p.frecuencia_km) * 100;
            if (porcentaje > 100) porcentaje = 100;
            if (porcentaje < 0) porcentaje = 0;

            // Estado visual
            let estado = 'ok'; 
            if (kmRestantes <= 0) estado = 'vencido';
            else if (kmRestantes <= p.advertencia_km) estado = 'alerta';

            return {
                ...p, // id, nombre, icono...
                km_restantes: kmRestantes,
                porcentaje_vida: parseFloat(porcentaje.toFixed(0)),
                estado_visual: estado,
                proximo_cambio_calculado: proximoCambio
            };
        });

        // Retornamos un OBJETO HÍBRIDO
        return {
            ...datosAuto, // odometro_actual, proximo_cambio_aceite...
            partes: reportePartes // Array con la lista detallada
        };
    }

    // 2. Actualizar Odómetro
    static async actualizarOdometro(nuevoKm) {
        const query = "UPDATE vehiculo SET odometro_actual = ?, ultima_actualizacion = NOW() WHERE id = 1";
        const [result] = await db.query(query, [nuevoKm]);
        return result.affectedRows > 0;
    }

    // 3. Registrar Cambio de Aceite (SINCRONIZADO)
    // Actualiza la tabla `vehiculo` Y TAMBIÉN la fila de aceite en `mantenimientos`
    static async actualizarProximoCambioAceite(nuevoMetaKm, nuevoKmActual, intervalo) {
        // A. Actualizar tabla principal (Vehiculo)
        await db.query("UPDATE vehiculo SET proximo_cambio_aceite = ? WHERE id = 1", [nuevoMetaKm]);
        
        // B. Actualizar tabla secundaria (Mantenimientos) para mantener coherencia
        // Buscamos donde el nombre sea parecido a 'Aceite'
        await db.query(`
            UPDATE mantenimientos 
            SET ultimo_cambio_km = ?, frecuencia_km = ? 
            WHERE nombre LIKE '%Aceite de Motor%'
        `, [nuevoKmActual, intervalo]);
        
        return true;
    }

    // 4. Registrar Mantenimiento de OTRA parte (Caja, GLP, etc.)
    static async realizarMantenimientoParte(idParte, kmAlMomentoDelCambio) {
        const query = "UPDATE mantenimientos SET ultimo_cambio_km = ? WHERE id = ?";
        const [result] = await db.query(query, [kmAlMomentoDelCambio, idParte]);
        return result.affectedRows > 0;
    }

    // 5. Inicializar (Si está vacío)
    static async inicializar(kmInicial, metaInicial) {
        const query = `
            INSERT INTO vehiculo (id, odometro_actual, proximo_cambio_aceite) 
            SELECT 1, ?, ? 
            WHERE NOT EXISTS (SELECT * FROM vehiculo)
        `;
        await db.query(query, [kmInicial, metaInicial]);
    }

    // 6. Documentos
    static async actualizarDocumentos(soat, revision, gnv) {
        const query = "UPDATE vehiculo SET fecha_soat=?, fecha_revision=?, fecha_gnv=? WHERE id=1";
        const [result] = await db.query(query, [soat || null, revision || null, gnv || null]);
        return result.affectedRows > 0;
    }
}

module.exports = VehiculoModel;