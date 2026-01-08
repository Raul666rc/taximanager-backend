// UBICACIÓN: index.js (En la raíz)
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Importamos las rutas que acabamos de crear
const viajeRoutes = require('./src/routes/viajeRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares (Configuración global)
app.use(cors());                 // Permite conexiones externas
app.use(express.json());         // Entiende JSON (reemplaza a body-parser)


// --- NUEVO BLOQUE: SERVIR ARCHIVOS ESTÁTICOS ---
// Esto hace que la carpeta 'public' sea accesible desde el navegador
app.use(express.static('public')); 
// -----------------------------------------------

// Rutas
app.use('/api/viajes', viajeRoutes);

// Cambiamos la ruta raíz '/' para que ya no diga "Backend Activo",
// sino que entregue tu archivo index.html automáticamente.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => { // <--- '0.0.0.0' permite acceso desde la red (celular)
    console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});