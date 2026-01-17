// UBICACIÓN: src/routes/viajeRoutes.js
const express = require('express');
const router = express.Router();

// Importamos la Clase Controladora
const ViajeController = require('../controllers/ViajeController');
const FinanzasController = require('../controllers/FinanzasController');
const AuthController = require('../controllers/AuthController');

const ReporteController = require('../controllers/ReporteController');

const VehiculoController = require('../controllers/VehiculoController');

// Definimos las URLs
// POST http://localhost:3000/api/viajes/iniciar
router.post('/iniciar', ViajeController.iniciarCarrera);

// --- AGREGA ESTA LÍNEA NUEVA ---
router.post('/parada', ViajeController.registrarParada);

// POST http://localhost:3000/api/viajes/finalizar
router.post('/finalizar', ViajeController.terminarCarrera);

router.get('/resumen', ViajeController.obtenerResumen);

// --- AGREGAR ESTA LÍNEA ---
router.post('/gastos', ViajeController.registrarGasto);
// --------------------------
router.get('/finanzas/grafico-gastos', FinanzasController.obtenerEstadisticasGastos);

// --- 2. AGREGAR ESTA RUTA NUEVA ---
router.get('/billetera', FinanzasController.obtenerBilletera);
// ----------------------------------

// --- AGREGAR ESTA LÍNEA ---
router.get('/historial', ViajeController.obtenerHistorialHoy);
// --------------------------

// --- AGREGAR ESTO ---
router.delete('/anular/:id', ViajeController.anularCarrera); 
// (Nota que usamos .delete, es un verbo HTTP especial para borrar)
// Agrega esta línea junto a las otras rutas GET
router.get('/activo', ViajeController.obtenerViajeActivo);
// --------------------

// --- 2. AGREGAR RUTA DE LOGIN ---
router.post('/login', AuthController.login);
// -------------------------------

// --- AGREGAR ESTO ---
router.post('/meta', FinanzasController.actualizarMeta);
// --------------------

// --- AGREGAR ESTO ---
router.get('/reporte', ViajeController.descargarReporte);
// --------------------

router.get('/reporte', ReporteController.descargarHistorial);
// NUEVA RUTA PARA FINANZAS
router.get('/reporte/finanzas', ReporteController.descargarFinanzas);

router.post('/transaccion', FinanzasController.registrarTransaccion);

// --- AGREGAR ESTO ---
router.post('/transferir', FinanzasController.realizarTransferencia);
// --------------------

// RUTAS ACTUALIZADAS
router.get('/obligaciones', FinanzasController.obtenerObligaciones); // (Asegúrate de tener este método en el Controller, es igual al anterior)
router.post('/obligaciones', FinanzasController.crearObligacion);
router.post('/compromisos', FinanzasController.crearCompromiso);     // <--- Cambio de nombre
router.post('/obligaciones/pagar', FinanzasController.pagarObligacion);
// GESTIÓN DE CONTRATOS
router.get('/compromisos', FinanzasController.listarCompromisos);
router.post('/compromisos/cancelar', FinanzasController.cancelarCompromiso);
// En la sección de Finanzas
router.get('/reparto/sugerencia', FinanzasController.obtenerSugerenciaReparto);
router.get('/finanzas/cierre-datos', FinanzasController.obtenerDatosCierre);
router.post('/finanzas/cierre-ajuste', FinanzasController.procesarAjusteCaja);
router.get('/finanzas/cuentas', FinanzasController.listarCuentas);
router.get('/finanzas/movimientos', FinanzasController.listarMovimientos);

// Ruta para descargar el Excel/CSV
router.get('/reporte/descargar', ViajeController.descargarReporte);

router.get('/ruta/:id', ViajeController.obtenerRutaGPS);


router.get('/vehiculo', VehiculoController.obtenerEstado);
router.post('/vehiculo/actualizar', VehiculoController.actualizarKilometraje);
router.post('/vehiculo/mantenimiento', VehiculoController.registrarCambioAceite);
router.post('/vehiculo/documentos', VehiculoController.guardarDocumentos);

module.exports = router;