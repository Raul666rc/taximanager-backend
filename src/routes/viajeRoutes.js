// UBICACIÓN: src/routes/viajeRoutes.js
const express = require('express');
const router = express.Router();

// Importamos la Clase Controladora
const ViajeController = require('../controllers/ViajeController');
const FinanzasController = require('../controllers/FinanzasController');

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

module.exports = router;