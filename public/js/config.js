// ==========================================
// 1. CONFIGURACIÓN GLOBAL Y SEGURIDAD
// ==========================================

// Verificación de Seguridad
const usuarioLogueado = localStorage.getItem('taxi_user');
if (!usuarioLogueado) window.location.href = 'login.html';

// URL Base de la API
const API_URL = '/api/viajes';

// Variables Globales Compartidas (Cache de Finanzas)
let saldosCache = {};