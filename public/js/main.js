// ==========================================
// MAIN.JS - PUNTO DE ENTRADA (DIRECTOR DE ORQUESTA)
// ==========================================

// Variable para el control de pantalla
let wakeLock = null;

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

    // 6. ACTIVAR PANTALLA SIEMPRE ENCENDIDA 💡
    activarPantallaEncendida();

    // --- LISTENERS GLOBALES ---
    
    // Detectar cierre del modal de contratos para refrescar badge rojo
    const modalContratosEl = document.getElementById('modalContratos');
    if (modalContratosEl) {
        modalContratosEl.addEventListener('hidden.bs.modal', function () {
            console.log("Refrescando obligaciones...");
            cargarObligaciones();
        });
    }

    // Si el usuario minimiza la app y vuelve, reactivar el bloqueo de pantalla
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            await activarPantallaEncendida();
        }
    });
};

// --- FUNCIÓN DE PANTALLA SIEMPRE ENCENDIDA ---
async function activarPantallaEncendida() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('💡 Pantalla bloqueada en encendido (Wake Lock activo)');
            
            // Si el sistema suelta el bloqueo (por batería baja u otra razón)
            wakeLock.addEventListener('release', () => {
                console.log('📴 Bloqueo de pantalla liberado');
            });
        } catch (err) {
            console.error(`Error al activar pantalla encendida: ${err.name}, ${err.message}`);
            // Nota: Esto puede fallar si la batería está muy baja o el navegador no lo permite.
        }
    } else {
        console.warn("⚠️ Tu navegador no soporta Wake Lock API (Pantalla siempre encendida).");
    }
}