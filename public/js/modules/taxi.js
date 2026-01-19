// ==========================================
// MÓDULO: TAXI (GPS, CRONÓMETRO, MAPA)
// ==========================================

let viajeActualId = null;
let viajeInicioCoords = null;
let viajeInicioTime = null;
let mapaGlobal = null;
let timerInterval = null; // Variable para el reloj en vivo

// Función para formatear el reloj (00:00)
function actualizarReloj() {
    if (!viajeInicioTime) return;
    const ahora = new Date();
    const diff = ahora - viajeInicioTime;
    
    // Cálculo horas, minutos, segundos
    const hrs = Math.floor(diff / 3600000);
    const min = Math.floor((diff % 3600000) / 60000);
    const sec = Math.floor((diff % 60000) / 1000);

    const strMin = min.toString().padStart(2, '0');
    const strSec = sec.toString().padStart(2, '0');
    
    // Si pasa de una hora, mostramos HH:MM:SS, sino MM:SS
    const tiempoTexto = hrs > 0 ? `${hrs}:${strMin}:${strSec}` : `${strMin}:${strSec}`;
    
    const el = document.getElementById('liveTimer');
    if (el) el.innerText = tiempoTexto;

    // Cálculo APROXIMADO de distancia (Línea recta simple para UI visual)
    // Nota: La distancia real la calcula el backend con los puntos GPS, esto es solo visual
    if(viajeInicioCoords) {
        // Esto se actualizaría mejor si tuviéramos la posición actual constante, 
        // por ahora lo dejamos en 0.0 o simulado si prefieres.
        // Para V3.1 implementaremos watchPosition real para esto.
    }
}

// 1. INICIAR CARRERA
async function iniciarCarrera() {
    if (!navigator.geolocation) return notificar("Sin GPS", "error");

    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    const btn = document.getElementById('btnIniciar');
    
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin fa-3x mb-2"></i><span class="fs-4">Conectando...</span>';
    btn.disabled = true;

    const procesarInicio = async (lat, lng) => {
        try {
            viajeInicioCoords = { lat, lng };
            viajeInicioTime = new Date();

            const response = await fetch(`${API_URL}/iniciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origen_tipo: appSeleccionada, lat: lat, lng: lng })
            });

            const resultado = await response.json();

            if (resultado.success) {
                viajeActualId = resultado.data.id_viaje;
                
                // UI: Cambio de pantalla
                document.getElementById('selectorApps').classList.add('d-none');
                document.getElementById('btnIniciar').classList.add('d-none');
                document.getElementById('panelEnCarrera').classList.remove('d-none');
                
                // INICIAR RELOJ
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(actualizarReloj, 1000);
                actualizarReloj(); // Primera llamada inmediata

                notificar("🚖 ¡Carrera Iniciada!", "success");
            } else { throw new Error(resultado.message); }

        } catch (error) { 
            notificar("Error: " + error.message, "error");
            restaurarBotonInicio();
        }
    };

    const opcionesGPS = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 };
    navigator.geolocation.getCurrentPosition(
        (pos) => procesarInicio(pos.coords.latitude, pos.coords.longitude),
        (err) => {
            notificar("⚠️ Iniciando sin ubicación precisa.", "info");
            procesarInicio(0, 0);
        },
        opcionesGPS
    );
}

// ==========================================
// NUEVA LÓGICA DE CANCELACIÓN (CON MODAL)
// ==========================================

// 1. Abrir el modal (reemplaza al confirm nativo)
function abrirConfirmarCancelacion() {
    const modal = new bootstrap.Modal(document.getElementById('modalConfirmarCancelacion'));
    modal.show();
}

// 2. Ejecutar borrado (se llama desde el botón "SÍ, BORRAR" del modal)
async function procederCancelacion() {
    // Feedback visual en el botón del modal
    const btn = document.querySelector('#modalConfirmarCancelacion .btn-danger');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';

    // Detener reloj inmediatamente
    if (timerInterval) clearInterval(timerInterval);

    try {
        // Avisar al backend para que borre el ID si existe
        if(viajeActualId) {
            await fetch(`${API_URL}/anular/${viajeActualId}`, { method: 'DELETE' });
        }
        
        notificar("🗑️ Carrera descartada", "info");
        
        // Cerrar modal
        const modalEl = document.getElementById('modalConfirmarCancelacion');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        modalInstance.hide();

        // Restaurar UI (Volver al botón INICIAR)
        document.getElementById('panelEnCarrera').classList.add('d-none');
        document.getElementById('selectorApps').classList.remove('d-none');
        restaurarBotonInicio();
        
        // Limpieza
        viajeActualId = null;
        
    } catch(e) { 
        notificar("Error al cancelar", "error"); 
    } finally {
        // Restaurar botón del modal por si se reusa
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = txtOriginal;
        }, 500);
    }
}

function restaurarBotonInicio() {
    const btn = document.getElementById('btnIniciar');
    btn.classList.remove('d-none');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-power-off fa-4x mb-2"></i><span class="fw-bold fs-3">INICIAR</span>';
}

// 2. REGISTRAR PARADA
async function registrarParada() {
    if (!viajeActualId) return;
    const opcionesGPS = { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 };
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            await fetch(`${API_URL}/parada`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_viaje: viajeActualId, lat: pos.coords.latitude, lng: pos.coords.longitude, tipo: 'PARADA' })
            });
            notificar("📍 Parada registrada", "info");
        } catch (e) {}
    }, (err) => notificar("⚠️ No se pudo guardar ubicación parada", "warning"), opcionesGPS);
}

// 3. FINALIZAR
async function guardarCarrera() {
    const monto = document.querySelector('#modalCobrar input[type="number"]').value;
    const esYape = document.getElementById('pago2').checked;
    
    if (!monto) return notificar("Ingresa el monto", "error");

    const btnModal = document.querySelector('#modalCobrar .btn-success');
    const textoOriginalModal = btnModal.innerHTML;
    btnModal.disabled = true; 
    btnModal.innerHTML = '<i class="fas fa-sync fa-spin"></i> Guardando...';

    const finalizarEnServidor = async (lat, lng) => {
        try {
            // Detener reloj
            if (timerInterval) clearInterval(timerInterval);

            let duracion = 0;
            if(viajeInicioTime) duracion = Math.floor((new Date() - viajeInicioTime)/60000);

            const res = await fetch(`${API_URL}/finalizar`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_viaje: viajeActualId, monto: parseFloat(monto), metodo_pago_id: esYape ? 2 : 1,
                    lat: lat, lng: lng, duracion_min: duracion
                })
            });

            if ((await res.json()).success) {
                notificar("🏁 Carrera Finalizada", "success");
                
                // UI Clean up
                bootstrap.Modal.getInstance(document.getElementById('modalCobrar')).hide();
                document.getElementById('panelEnCarrera').classList.add('d-none');
                document.getElementById('selectorApps').classList.remove('d-none');
                restaurarBotonInicio();
                document.querySelector('#modalCobrar input[type="number"]').value = '';
                viajeActualId = null;

                if(typeof cargarHistorial === 'function') cargarHistorial();
                if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
            } else { notificar("Error al guardar", "error"); }
        } catch (e) { notificar("Error de conexión", "error"); } 
        finally {
            setTimeout(() => { btnModal.disabled = false; btnModal.innerHTML = textoOriginalModal; }, 500);
        }
    };

    const opcionesGPS = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 };
    navigator.geolocation.getCurrentPosition(
        (pos) => finalizarEnServidor(pos.coords.latitude, pos.coords.longitude), 
        (err) => {
            console.warn("GPS falló, guardando sin ubicación.");
            finalizarEnServidor(0, 0);
        }, 
        opcionesGPS
    );
}

// 4. RECUPERAR SESIÓN
async function verificarViajeEnCurso() {
    try {
        const res = await fetch(`${API_URL}/activo`);
        const data = await res.json();
        if (data.success && data.viaje) {
            viajeActualId = data.viaje.id;
            viajeInicioTime = new Date(data.viaje.fecha_hora_inicio);
            
            document.getElementById('selectorApps').classList.add('d-none');
            document.getElementById('btnIniciar').classList.add('d-none');
            document.getElementById('panelEnCarrera').classList.remove('d-none');
            
            // Reactivar reloj
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(actualizarReloj, 1000);
            actualizarReloj();
            
            console.log("♻️ Sesión recuperada");
        } else {
            restaurarBotonInicio();
        }
    } catch (e) { restaurarBotonInicio(); }
}

// 5. VER MAPA (Igual que antes)
async function verMapa(id) {
    const modalEl = document.getElementById('modalMapa');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    try {
        const res = await fetch(`${API_URL}/ruta/${id}`);
        const data = await res.json();
        if(data.success && data.data.length > 0) {
            setTimeout(() => {
                if(mapaGlobal) mapaGlobal.remove();
                const pts = data.data;
                mapaGlobal = L.map('mapaLeaflet').setView([parseFloat(pts[0].lat), parseFloat(pts[0].lng)], 14);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaGlobal);
                let linea = [];
                pts.forEach(p => {
                    const c = [parseFloat(p.lat), parseFloat(p.lng)];
                    linea.push(c);
                    if(p.tipo === 'INICIO') L.marker(c).addTo(mapaGlobal).bindPopup('Inicio');
                    if(p.tipo === 'FIN') L.marker(c).addTo(mapaGlobal).bindPopup('Fin');
                });
                if(linea.length > 1) {
                    const poly = L.polyline(linea, {color: 'blue', weight: 4}).addTo(mapaGlobal);
                    mapaGlobal.fitBounds(poly.getBounds());
                }
            }, 500);
        } else document.getElementById('mapaLeaflet').innerHTML = '<div class="text-white p-5 text-center">Sin datos GPS.</div>';
    } catch(e) {}
}