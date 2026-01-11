// UBICACIÓN: src/models/TransaccionModel.js
const db = require('../config/db');

class TransaccionModel {

    // Método para crear una transacción (Ingreso o Gasto)
    static async crear(datos) {
        // datos = { tipo, ambito, monto, cuenta_id, viaje_id, descripcion }
        const query = `
            INSERT INTO transacciones 
            (tipo, ambito, monto, cuenta_id, viaje_id, descripcion, fecha)
            VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 5 HOUR))
        `;
        const valores = [
            datos.tipo, 
            datos.ambito, 
            datos.monto, 
            datos.cuenta_id, 
            datos.viaje_id, 
            datos.descripcion
        ];
        
        const [result] = await db.query(query, valores);
        return result.insertId;
    }

    // Método para actualizar el saldo de una cuenta (Bolsillo, Yape, Ahorro)
    static async actualizarSaldoCuenta(cuentaId, monto, esIngreso) {
        // Si es ingreso SUMA (+), si es gasto RESTA (-)
        const operador = esIngreso ? '+' : '-';
        
        const query = `
            UPDATE cuentas 
            SET saldo_actual = saldo_actual ${operador} ? 
            WHERE id = ?
        `;
        await db.query(query, [monto, cuentaId]);
    }

    // --- LA JOYA DE LA CORONA: EL DISTRIBUIDOR AUTOMÁTICO ---
    static async distribuirIngresoTaxi(viajeId, montoTotal, cuentaIdDondeEntroElDinero) {
        try {
            // 1. Calcular montos según tu regla 10-10-80
            const montoPropio = montoTotal * 0.10;   // 10% Para ti
            const montoAhorro = montoTotal * 0.10;   // 10% Ahorro
            const montoOperativo = montoTotal * 0.80; // 80% Gasolina, Deudas, Estudios

            // 2. Registrar los movimientos en el historial (Transacciones)
            
            // A) El ingreso total (La entrada principal)
            await this.crear({
                tipo: 'INGRESO',
                ambito: 'TAXI',
                monto: montoOperativo, // Registramos la parte operativa como disponible
                cuenta_id: cuentaIdDondeEntroElDinero,
                viaje_id: viajeId,
                descripcion: 'Ingreso Operativo (80%) por carrera'
            });

            // B) Separar el "Pago Propio" (Simulamos que sale del operativo y va a tu 'Bolsillo Personal')
            // Nota: Para simplificar, por ahora solo registraremos que ese dinero TIENE DUEÑO.
            // En una versión V2 podemos moverlo a otra cuenta bancaria real.
            await this.crear({
                tipo: 'INGRESO',
                ambito: 'PERSONAL',
                monto: montoPropio,
                cuenta_id: cuentaIdDondeEntroElDinero,
                viaje_id: viajeId,
                descripcion: 'Pago Propio 10% (Intocable)'
            });

            // C) Separar el Ahorro
            await this.crear({
                tipo: 'INGRESO',
                ambito: 'PERSONAL', // O 'AHORRO'
                monto: montoAhorro,
                cuenta_id: cuentaIdDondeEntroElDinero,
                viaje_id: viajeId,
                descripcion: 'Fondo Ahorro 10%'
            });

            // 3. Actualizar el saldo REAL de la cuenta (Yape o Efectivo)
            // Aquí sumamos TODO el dinero a la cuenta física, porque el dinero entró todo junto.
            await this.actualizarSaldoCuenta(cuentaIdDondeEntroElDinero, montoTotal, true);

            return true;
        } catch (error) {
            console.error("Error distribuyendo dinero:", error);
            throw error;
        }
    }
}

module.exports = TransaccionModel;