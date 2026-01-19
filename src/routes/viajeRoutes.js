// UBICACIÓN: src/routes/viajeRoutes.js
const express = require('express');
const router = express.Router();

// --- IMPORTACIÓN DE LOS CEREBROS (CONTROLADORES) ---
// Cada uno maneja una parte lógica del negocio
const AuthController = require('../controllers/AuthController');       // Login y seguridad
const ViajeController = require('../controllers/ViajeController');     // Todo lo del Taxi (GPS, Carreras)
const FinanzasController = require('../controllers/FinanzasController'); // Dinero, Cuentas, Yape, Efectivo
const MetasController = require('../controllers/MetasController');     // Las Metas de las Wardas (Lo que arreglamos hoy)
const VehiculoController = require('../controllers/VehiculoController'); // Mantenimiento, Aceite, KM
const CuentasController = require('../controllers/CuentasController');   // Crear/Editar Cuentas (Admin)
const ReporteController = require('../controllers/ReporteController');   // Descargas Excel

// ==================================================================
// 1. AUTENTICACIÓN Y ACCESO
// ==================================================================
// Se usa en la pantalla de Login (index.html al abrir)
router.post('/login', AuthController.login); // Recibe usuario/pass y da acceso


// ==================================================================
// 2. MÓDULO TAXI (MODO CONDUCCIÓN)
// ==================================================================
// Botón Verde Gigante "INICIAR": Crea el viaje en BD y guarda hora inicio
router.post('/iniciar', ViajeController.iniciarCarrera);

// Botón Amarillo "PARADA": Guarda coordenadas intermedias (si el pasajero baja un rato)
router.post('/parada', ViajeController.registrarParada);

// Botón Rojo Gigante "FINALIZAR": Cierra el viaje, calcula duración y guarda el cobro
router.post('/finalizar', ViajeController.terminarCarrera);

// Botón "Cancelar Carrera (Error)": Borra el viaje actual como si nunca hubiera existido
router.delete('/anular/:id', ViajeController.anularCarrera);

// Al recargar la página: Verifica si te quedaste con una carrera abierta (recuperación de sesión)
router.get('/activo', ViajeController.obtenerViajeActivo);

// Dashboard Principal: Obtiene el total ganado hoy (S/.) y la meta diaria (Barra de progreso)
router.get('/resumen', ViajeController.obtenerResumen);

// Lista de Carreras de Hoy: Llena la tarjeta "Historial de Viajes"
router.get('/historial', ViajeController.obtenerHistorialHoy);

// Botón Mapa en Historial: Obtiene los puntos GPS para dibujar la línea azul en el mapa
router.get('/ruta/:id', ViajeController.obtenerRutaGPS);

// AGREGAR ESTA LÍNEA (Recupera la función de editar meta diaria)
router.post('/config/meta', ViajeController.guardarMetaDiaria);

// ==================================================================
// 3. MÓDULO FINANZAS (EL CORAZÓN DEL DINERO)
// ==================================================================

// --- BILLETERA Y MOVIMIENTOS ---
// Tarjeta Billetera: Obtiene saldos de Efectivo, Yape, Wardas, etc.
router.get('/billetera', FinanzasController.obtenerBilletera);

// Tarjeta Movimientos: Lista los últimos ingresos y gastos generales
router.get('/finanzas/movimientos', FinanzasController.listarMovimientos);

// Botón "Registrar Movimiento": Para ingresos o gastos manuales que NO son carreras
router.post('/transaccion', FinanzasController.registrarTransaccion);

// Botón "Transferir": Mover dinero de Yape a Warda, o de Efectivo a Banco
router.post('/transferir', FinanzasController.realizarTransferencia);


// --- GASTOS RÁPIDOS Y CIERRE ---
// Botón Flotante (Si lo ponemos): Registra gastos rápidos (Gasolina/Comida)
router.post('/gastos', FinanzasController.registrarGastoRapido); 
router.post('/finanzas/gasto-rapido', FinanzasController.registrarGastoRapido); // (Alias por seguridad)

// Modal Cierre de Caja: Obtiene cuánto deberías tener vs cuánto tienes
router.get('/finanzas/cierre-datos', FinanzasController.obtenerDatosCierre);
router.post('/finanzas/cierre-ajuste', FinanzasController.procesarAjusteCaja); // Guarda el arqueo final


// --- METAS FINANCIERAS (LO QUE ARREGLAMOS HOY) ---
// Tarjeta Objetivos: Muestra las barras de progreso de tus Wardas
router.get('/finanzas/metas', MetasController.obtenerEstadoMetas);

// Modal Editar Meta: Guarda o Actualiza el monto objetivo de una cuenta
router.post('/finanzas/metas/editar', MetasController.actualizarMeta);


// --- DEUDAS Y COMPROMISOS (OBLIGACIONES) ---
// Tarjeta Deudas: Lista recordatorios y préstamos pendientes
router.get('/obligaciones', FinanzasController.obtenerObligaciones);

// Botón "Nueva Deuda": Crea un recordatorio simple
router.post('/obligaciones', FinanzasController.crearObligacion);

// Botón "Pagar": Descuenta dinero de tu cuenta y reduce la deuda
router.post('/obligaciones/pagar', FinanzasController.pagarObligacion);

// Modal Contratos: Lista los préstamos grandes o contratos de servicio
router.get('/compromisos', FinanzasController.listarCompromisos);
router.post('/compromisos', FinanzasController.crearCompromiso); // Crear contrato
router.post('/compromisos/cancelar', FinanzasController.cancelarCompromiso); // Dar de baja


// --- SUGERENCIAS INTELIGENTES ---
// Botón "Repartir": Sugiere cómo distribuir el dinero del día en las Wardas
router.get('/reparto/sugerencia', FinanzasController.obtenerSugerenciaReparto);


// ==================================================================
// 4. MÓDULO VEHÍCULO (MANTENIMIENTO)
// ==================================================================
// Tarjeta Estado del Auto: Obtiene KM, vida del aceite y fechas SOAT
router.get('/vehiculo', VehiculoController.obtenerEstado);

// Modal Corregir KM: Ajusta el odómetro manualmente
router.post('/vehiculo/actualizar', VehiculoController.actualizarKilometraje);

// Botón "Cambio Aceite": Registra el cambio y resetea la barra de vida
router.post('/vehiculo/mantenimiento', VehiculoController.registrarCambioAceite);

// Modal Documentos: Guarda las fechas de vencimiento de SOAT/Revisión
router.post('/vehiculo/documentos', VehiculoController.guardarDocumentos);


// ==================================================================
// 5. CONFIGURACIÓN (ADMINISTRACIÓN DE CUENTAS)
// ==================================================================
// Modal Configuración: Lista todas las cuentas disponibles
router.get('/cuentas/listar', CuentasController.listarCuentas);

// Botón "Guardar/Editar Cuenta": Cambia nombre o crea nueva cuenta
router.post('/cuentas/guardar', CuentasController.guardarCuenta);

// Botón "Ojo" (Activar/Desactivar): Oculta cuentas que ya no usas
router.post('/cuentas/estado', CuentasController.toggleEstado);

// Para llenar los <select> (listas desplegables) en los modales de pago
router.get('/finanzas/cuentas', FinanzasController.obtenerCuentas);


// ==================================================================
// 6. REPORTES Y EXCEL
// ==================================================================
// Botón "Descargar Excel" en Historial (Reporte de Carreras)
router.get('/reporte', ReporteController.descargarHistorial);

// Botón "Descargar Reporte" en Finanzas (Flujo de Caja)
router.get('/reporte/finanzas', ReporteController.descargarFinanzas);

module.exports = router;