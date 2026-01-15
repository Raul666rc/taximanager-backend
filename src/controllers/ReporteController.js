// UBICACIÓN: src/controllers/ReporteController.js
const db = require('../config/db');

class ReporteController {

    static async descargarHistorial(req, res) {
        try {
            // 1. Consultar TODOS los viajes (ordenados por fecha descendente)
            // Unimos tablas para que salga el nombre del método de pago, no el ID
            const query = `
                SELECT 
                    v.id, 
                    v.fecha_inicio, 
                    v.hora_inicio, 
                    v.hora_fin, 
                    v.origen_tipo, 
                    v.monto_cobrado, 
                    v.distancia_km, 
                    v.duracion_min,
                    mp.nombre as metodo_pago
                FROM viajes v
                LEFT JOIN metodo_pago mp ON v.metodo_cobro_id = mp.id
                WHERE v.estado = 'FINALIZADO'
                ORDER BY v.fecha_inicio DESC, v.hora_inicio DESC
            `;

            const [viajes] = await db.query(query);

            // 2. Crear las Cabeceras del CSV
            // Usamos punto y coma (;) porque en Excel de Perú/Latam funciona mejor que la coma
            let csv = "ID;FECHA;HORA;APP;MONTO;DISTANCIA(KM);DURACION(MIN);PAGO\n";

            // 3. Llenar los datos fila por fila
            viajes.forEach(v => {
                // Formatear fecha para que Excel la entienda bien (DD/MM/YYYY)
                const fechaObj = new Date(v.fecha_inicio);
                const fechaFmt = fechaObj.toLocaleDateString('es-PE');

                csv += `${v.id};${fechaFmt};${v.hora_inicio};${v.origen_tipo};${v.monto_cobrado};${v.distancia_km};${v.duracion_min};${v.metodo_pago}\n`;
            });

            // 4. Configurar la descarga en el navegador
            res.header('Content-Type', 'text/csv'); 
            res.attachment('Reporte_Taxi_Manager.csv'); // Nombre del archivo que se descarga
            return res.send(csv);

        } catch (error) {
            console.error(error);
            res.status(500).send("Error generando el reporte");
        }
    }
}

module.exports = ReporteController;