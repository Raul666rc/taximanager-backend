// UBICACIÓN: src/routes/viajeRoutes.js
const express = require('express');
const router = express.Router();

// Importamos la Clase Controladora
const ViajeController = require('../controllers/ViajeController');

// Definimos las URLs
// POST http://localhost:3000/api/viajes/iniciar
router.post('/iniciar', ViajeController.iniciarCarrera);

// --- AGREGA ESTA LÍNEA NUEVA ---
router.post('/parada', ViajeController.registrarParada);

// POST http://localhost:3000/api/viajes/finalizar
router.post('/finalizar', ViajeController.terminarCarrera);

router.get('/resumen', ViajeController.obtenerResumen);

module.exports = router;