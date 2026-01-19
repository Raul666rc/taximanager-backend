// ==========================================
// MÓDULO: TAXI (GPS, CRONÓMETRO, MAPA)
// ==========================================

let viajeActualId = null;
let viajeInicioCoords = null;
let viajeInicioTime = null;
let mapaGlobal = null;

// ==========================================
// 1. INICIAR CARRERA (MODO TURBO 🚀)
// ==========================================
async function iniciarCarrera() {
    if (!navigator.geolocation) return notificar("Sin GPS", "error");

    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    const btn = document.getElementById('btnIniciar');
    const txtOriginal = btn.innerHTML; // Guardamos el icono y texto original
    
    // Feedback visual inmediato
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> Iniciando...';
    btn.disabled = true;

    // LA CONFIGURACIÓN VELOZ:
    // 1. enableHighAccuracy: false -> Usa antenas/wifi si es más rápido que satélite.
    // 2. maximumAge: 60000 -> Si tienes una ubicación de hace 1 minuto, ÚSALA, no esperes.
    // 3. timeout: 5000 -> Si en 5s no hay nada, lanza error (para no trabar la app).
    const opcionesGPS = { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                // Guardamos datos en memoria RAM del teléfono
                viajeInicioCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
                viajeInicioTime = new Date();

                // Enviamos al servidor
                const response = await fetch(`${API_URL}/iniciar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        origen_tipo: appSeleccionada,
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    })
                });

                const resultado = await response.json();

                if (resultado.success) {
                    viajeActualId = resultado.data.id_viaje;
                    
                    // TRANSICIÓN DE PANTALLA
                    // Ocultamos botones de inicio
                    document.getElementById('selectorApps').classList.add('d-none');
                    document.getElementById('btnIniciar').classList.add('d-none');
                    
                    // Mostramos panel de carrera
                    document.getElementById('panelEnCarrera').classList.remove('d-none');
                    document.getElementById('txtCronometro').innerText = "En curso: " + new Date().toLocaleTimeString();
                    
                    notificar("🚖 ¡Carrera Iniciada!", "success");
                } else {
                    notificar("Error servidor: " + resultado.message, "error");
                    // Si falla el server, restauramos botón
                    btn.innerHTML = txtOriginal;
                    btn.disabled = false;
                }

            } catch (error) { 
                console.error(error);
                notificar("Error de conexión", "error");
                btn.innerHTML = txtOriginal;
                btn.disabled = false;
            } 
        },
        (error) => { 
            // PLAN B: Si falla el GPS, avisamos pero liberamos el botón
            console.warn("Error GPS al iniciar:", error);
            notificar("⚠️ GPS lento o desactivado. Intenta de nuevo.", "error"); 
            btn.disabled = false; 
            btn.innerHTML = txtOriginal; 
        },
        opcionesGPS 
    );
}

// ==========================================
// 2. REGISTRAR PARADA (OPTIMIZADO)
// ==========================================
async function registrarParada() {
    if (!viajeActualId) return;

    const btn = document.getElementById('btnParada'); // Asumiendo que el botón tiene este ID o lo buscas por clase
    // Feedback visual inmediato (si lo tienes configurado)
    // if(btn) btn.disabled = true; 

    // OPCIONES GPS RÁPIDAS
    const opcionesGPS = { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 };

    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            await fetch(`${API_URL}/parada`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id_viaje: viajeActualId, 
                    lat: pos.coords.latitude, 
                    lng: pos.coords.longitude, 
                    tipo: 'PARADA' 
                })
            });
            notificar("📍 Parada registrada", "info");
        } catch (e) { 
            console.error(e);
            notificar("Error al guardar parada", "error"); 
        } finally {
            // if(btn) btn.disabled = false;
        }
    }, (err) => {
        // Si falla GPS, guardamos igual (con coords 0,0 o nulas si tu backend lo permite, o avisamos)
        // Para velocidad, asumimos fallo leve y notificamos
        console.warn("GPS Lento en parada:", err);
        notificar("⚠️ GPS lento, reintenta en un momento.", "error");
    }, opcionesGPS);
}

// ==========================================
// 3. FINALIZAR (BLINDADO A PRUEBA DE FALLOS)
// ==========================================
async function guardarCarrera() {
    const monto = document.querySelector('#modalCobrar input[type="number"]').value;
    const esYape = document.getElementById('pago2').checked;
    
    if (!monto) return notificar("Ingresa el monto", "error");

    // 1. Bloqueo visual inmediato para evitar doble click
    const btn = document.querySelector('#modalCobrar .btn-success');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true; 
    btn.className = 'btn btn-warning w-100 btn-lg fw-bold';
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Procesando...';

    // Función interna para enviar datos (se usa con o sin GPS)
    const enviarAlServidor = async (lat, lng) => {
        try {
            let duracion = 0;
            if(viajeInicioTime) duracion = Math.floor((new Date() - viajeInicioTime)/60000);

            const res = await fetch(`${API_URL}/finalizar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_viaje: viajeActualId,
                    monto: parseFloat(monto),
                    metodo_pago_id: esYape ? 2 : 1,
                    lat: lat,
                    lng: lng,
                    duracion_min: duracion
                })
            });

            const data = await res.json();

            if (data.success) {
                // ÉXITO: CERRAR TODO Y VOLVER AL INICIO
                notificar("🏁 Carrera Finalizada", "success");
                
                // 1. Ocultar Modal
                const modalEl = document.getElementById('modalCobrar');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                
                // 2. Restaurar Pantalla (Vital)
                document.getElementById('panelEnCarrera').classList.add('d-none');
                document.getElementById('btnIniciar').classList.remove('d-none');
                document.getElementById('selectorApps').classList.remove('d-none');
                
                // 3. Limpieza Variables
                document.querySelector('#modalCobrar input[type="number"]').value = '';
                viajeActualId = null;

                // 4. Actualizar datos de fondo
                if(typeof cargarHistorial === 'function') cargarHistorial();
                if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();

            } else {
                notificar("Error: " + data.message, "error");
            }
        } catch (e) {
            notificar("Error de conexión con el servidor", "error");
        } finally {
            // Restaurar botón del modal por si hay que reintentar
            setTimeout(() => {
                btn.disabled = false; 
                btn.className = 'btn btn-success w-100 btn-lg fw-bold';
                btn.innerHTML = textoOriginal; 
            }, 500);
        }
    };

    // 2. Intentamos obtener GPS rápido
    const opcionesGPS = { enableHighAccuracy: false, timeout: 2500, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            // Caso ideal: Tenemos GPS
            enviarAlServidor(pos.coords.latitude, pos.coords.longitude);
        }, 
        (err) => {
            // Caso Fallo GPS: NO NOS DETENEMOS. Enviamos 0,0
            console.warn("GPS falló al finalizar, enviando sin ubicación.", err);
            enviarAlServidor(0, 0); 
        }, 
        opcionesGPS
    );
}

// 4. RECUPERAR AL RECARGAR
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
            document.getElementById('txtCronometro').innerText = "Recuperado: " + viajeInicioTime.toLocaleTimeString();
            console.log("♻️ Viaje recuperado ID:", viajeActualId);
        }
    } catch (e) {}
}

// 5. VER MAPA HISTÓRICO
async function verMapa(id) {
    new bootstrap.Modal(document.getElementById('modalMapa')).show();
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
                    const poly = L.polyline(linea, {color: 'blue'}).addTo(mapaGlobal);
                    mapaGlobal.fitBounds(poly.getBounds());
                }
            }, 500);
        }
    } catch(e) { document.getElementById('mapaLeaflet').innerHTML = 'Sin datos GPS'; }
}