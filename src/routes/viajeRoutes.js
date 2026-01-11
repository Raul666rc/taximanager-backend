// UBICACIÓN: src/routes/viajeRoutes.js
const express = require('express');
const router = express.Router();

// Importamos la Clase Controladora
const ViajeController = require('../controllers/ViajeController');
const FinanzasController = require('../controllers/FinanzasController');
const AuthController = require('../controllers/AuthController');

// Definimos las URLs
// POST http://localhost:3000/api/viajes/iniciar
router.post('/iniciar', ViajeController.iniciarCarrera);

// --- AGREGA ESTA LÍNEA NUEVA ---
router.post('/parada', ViajeController.registrarParada);

// POST http://localhost:3000/api/viajes/finalizar
router.post('/finalizar', ViajeController.terminarCarrera);

router.get('/resumen', ViajeController.obtenerResumen);

// --- AGREGAR ESTA LÍNEA ---
router.post('/gasto', ViajeController.registrarGasto);
// --------------------------
// --- 2. AGREGAR ESTA RUTA NUEVA ---
router.get('/billetera', FinanzasController.obtenerBilletera);
// ----------------------------------

// --- AGREGAR ESTA LÍNEA ---
router.get('/historial', ViajeController.obtenerHistorialHoy);
// --------------------------

// --- AGREGAR ESTO ---
router.delete('/anular/:id', ViajeController.anularCarrera); 
// (Nota que usamos .delete, es un verbo HTTP especial para borrar)
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

router.post('/transaccion', FinanzasController.registrarTransaccion);
module.exports = router;