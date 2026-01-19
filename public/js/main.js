// ==========================================
// MAIN.JS - PUNTO DE ENTRADA (DIRECTOR DE ORQUESTA)
// ==========================================

window.onload = function() {
    console.log("🚀 Sistema Taxi V3 Iniciado");

    // 1. Recuperar sesión de viaje activo (GPS)
    if (typeof verificarViajeEnCurso === 'function') {
        verificarViajeEnCurso(); 
    }

    // 2. Cargar datos financieros iniciales
    if (typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
    if (typeof cargarControlMetas === 'function') cargarControlMetas();
    
    // 3. Cargar datos del Vehículo
    if (typeof cargarEstadoVehiculo === 'function') cargarEstadoVehiculo();
    
    // 4. Cargar Historial y Movimientos
    if (typeof cargarHistorial === 'function') cargarHistorial();
    if (typeof cargarMovimientos === 'function') cargarMovimientos();

    // 5. Cargar Obligaciones (Badge Rojo)
    if (typeof cargarObligaciones === 'function') cargarObligaciones();

    // --- LISTENERS GLOBALES ---
    
    // Detectar cierre del modal de contratos para refrescar badge rojo
    const modalContratosEl = document.getElementById('modalContratos');
    if (modalContratosEl) {
        modalContratosEl.addEventListener('hidden.bs.modal', function () {
            console.log("Refrescando obligaciones...");
            cargarObligaciones();
        });
    }
};