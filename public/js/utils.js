// ==========================================
// 2. UTILIDADES Y HERRAMIENTAS
// ==========================================

// Calcular distancia entre dos coordenadas (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    if(!lat1 || !lat2) return 0;
    const R = 6371; // Radio de la tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(2); // Retorna Km con 2 decimales
}

// Sistema de Notificaciones (Toastify)
function notificar(mensaje, tipo = 'info') {
    let colorFondo;
    // Colores tipo "Semáforo"
    if (tipo === 'exito' || tipo === 'success') colorFondo = "linear-gradient(to right, #00b09b, #96c93d)"; // Verde
    if (tipo === 'error') colorFondo = "linear-gradient(to right, #ff5f6d, #ffc371)"; // Rojo
    if (tipo === 'info')  colorFondo = "linear-gradient(to right, #2193b0, #6dd5ed)"; // Azul

    Toastify({
        text: mensaje,
        duration: 3000,
        gravity: "top",
        position: "center",
        style: {
            background: colorFondo,
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            fontWeight: "bold",
            fontSize: "1.1rem"
        },
        stopOnFocus: false
    }).showToast();
}

// Funciones de Sesión y Reportes
function cerrarSesion() {
    if(confirm("¿Salir?")) {
        localStorage.removeItem('taxi_user');
        window.location.href = 'login.html';
    }
}

function descargarExcel() {
    if(confirm("¿Descargar Excel?")) window.location.href = `${API_URL}/reporte`;
}

function descargarReporteFinanciero() {
    if(confirm("¿Descargar Reporte de Gastos e Ingresos?")) {
        window.location.href = `${API_URL}/reporte/finanzas`;
    }
}