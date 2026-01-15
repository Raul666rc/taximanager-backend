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
    // NUEVO: Descargar Reporte de Movimientos (Ingresos vs Gastos)
    static async descargarFinanzas(req, res) {
        try {
            // 1. Consultamos la tabla 'transacciones' unida con 'cuentas'
            // Queremos ver fecha, si entró o salió plata, la categoría y de qué cuenta (Yape/Efectivo)
            const query = `
                SELECT 
                    t.id,
                    t.fecha,
                    t.tipo,         -- INGRESO, GASTO, TRANSFERENCIA
                    t.categoria,    -- Combustible, Alimentos, etc.
                    t.descripcion,
                    t.monto,
                    c.nombre as cuenta_nombre
                FROM transacciones t
                LEFT JOIN cuentas c ON t.cuenta_id = c.id
                ORDER BY t.fecha DESC, t.id DESC
            `;

            const [movimientos] = await db.query(query);

            // 2. Cabeceras del Excel (CSV)
            let csv = "ID;FECHA;TIPO;CATEGORIA;DESCRIPCION;CUENTA;MONTO (S/)\n";

            // 3. Llenar filas
            movimientos.forEach(m => {
                // Formato de fecha local
                const fechaFmt = new Date(m.fecha).toLocaleDateString('es-PE');
                
                // Limpiamos la descripción para que no rompa el CSV si tiene punto y coma
                const descLimpia = (m.descripcion || '').replace(/;/g, ',');

                // Si es GASTO, ponemos el monto en negativo visualmente para Excel
                let montoVisual = parseFloat(m.monto).toFixed(2);
                if (m.tipo === 'GASTO') montoVisual = `-${montoVisual}`;

                csv += `${m.id};${fechaFmt};${m.tipo};${m.categoria};${descLimpia};${m.cuenta_nombre};${montoVisual}\n`;
            });

            // 4. Enviar archivo
            res.header('Content-Type', 'text/csv'); 
            res.attachment('Reporte_Financiero.csv'); 
            return res.send(csv);

        } catch (error) {
            console.error(error);
            res.status(500).send("Error generando reporte financiero");
        }
    }
}

module.exports = ReporteController;