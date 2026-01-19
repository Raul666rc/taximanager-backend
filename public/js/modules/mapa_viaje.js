// ==========================================
// MÓDULO: MAPA, GPS Y CONTROL DE VIAJE
// ==========================================

// Variables del Módulo
let viajeActualId = null; 
let viajeInicioCoords = null; // Para calcular distancia
let viajeInicioTime = null;   // Para calcular duración
let mapaGlobal = null;        // Instancia de Leaflet

// --- INTERFAZ DE USUARIO ---
function mostrarPanelCarrera() {
    document.getElementById('btnIniciar').classList.add('d-none');
    document.getElementById('panelEnCarrera').classList.remove('d-none');
    document.getElementById('txtCronometro').innerText = "En curso: " + new Date().toLocaleTimeString();
}

function mostrarPanelInicio() {
    document.getElementById('panelEnCarrera').classList.add('d-none');
    document.getElementById('btnIniciar').classList.remove('d-none');
    const selector = document.getElementById('selectorApps');
    if(selector) selector.classList.remove('d-none');
    
    // Limpiar input del modal si existe
    const inputCobro = document.querySelector('#modalCobrar input[type="number"]');
    if(inputCobro) inputCobro.value = '';
    
    viajeActualId = null;
    viajeInicioCoords = null;
}

// --- LÓGICA DE VIAJE ---

// 1. INICIAR CARRERA
async function iniciarCarrera() {
    if (!navigator.geolocation) return notificar("❌ Tu navegador no soporta GPS", "error");

    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    const origenTexto = document.getElementById('inputOrigen')?.value || '';

    const btn = document.getElementById('btnIniciar');
    const textoOriginal = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> GPS...';
    btn.disabled = true;

    // Opciones GPS para velocidad
    const opcionesGPS = { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 };

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                viajeInicioCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
                viajeInicioTime = new Date();

                const datos = {
                    origen_tipo: appSeleccionada,
                    origen_texto: origenTexto, 
                    lat: position.coords.latitude, 
                    lng: position.coords.longitude
                };

                const response = await fetch(`${API_URL}/iniciar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });

                const resultado = await response.json();

                if (resultado.success) {
                    viajeActualId = resultado.data.id_viaje;
                    
                    const sel = document.getElementById('selectorApps');
                    if(sel) sel.classList.add('d-none');
                    
                    notificar("🚖 Carrera iniciada. ¡Buen viaje!", "info");
                    mostrarPanelCarrera();
                } else {
                    notificar("❌ Error al iniciar carrera", "error");
                }

            } catch (error) {
                console.error(error);
                notificar("Error de conexión", "error");
            } finally {
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
            }
        },
        (error) => {
            notificar("⚠️ Error GPS: " + error.message, "error");
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        },
        opcionesGPS
    );
}

// 2. REGISTRAR PARADA
async function registrarParada() {
    if (!viajeActualId) return;

    // Función interna para obtener ubicación robusta
    const obtenerUbicacionRobusta = () => {
        return new Promise((resolve, reject) => {
            // Intento 1: Rápido
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(pos),
                (err) => {
                    console.warn("⚠️ Falló ubicación rápida. Activando GPS Satelital...", err.message);
                    // Intento 2: Preciso
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve(pos),
                        (errFinal) => reject(errFinal),
                        { enableHighAccuracy: true, timeout: 10000 }
                    );
                },
                { enableHighAccuracy: false, timeout: 3000 }
            );
        });
    };

    try {
        const btn = document.getElementById('btnParada');
        if(btn) btn.disabled = true;

        const position = await obtenerUbicacionRobusta();

        await fetch(`${API_URL}/parada`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_viaje: viajeActualId,
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                tipo: 'PARADA'
            })
        });

        notificar("📍 Parada registrada", "info");

    } catch (e) {
        console.error(e);
        notificar("❌ No se pudo registrar la parada. Verifica tu GPS.", "error");
    } finally {
        const btn = document.getElementById('btnParada');
        if(btn) btn.disabled = false;
    }
}

// 3. FINALIZAR Y COBRAR
async function guardarCarrera() {
    const montoInput = document.querySelector('#modalCobrar input[type="number"]').value;
    const esYape = document.getElementById('pago2').checked; 
    const metodoId = esYape ? 2 : 1;
    const destinoManual = document.getElementById('inputDestino')?.value || '';

    if (!montoInput || montoInput <= 0) return; 

    const btnCobrar = document.querySelector('#modalCobrar .btn-success');
    const textoBtn = btnCobrar.innerText;
    
    // Feedback visual
    btnCobrar.disabled = true;
    btnCobrar.className = 'btn btn-warning w-100 btn-lg fw-bold'; 
    btnCobrar.innerHTML = '<i class="fas fa-sync fa-spin"></i> Procesando...';

    const opcionesGPS = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const latFin = position.coords.latitude;
            const lngFin = position.coords.longitude;

            let distancia = 0;
            if (viajeInicioCoords) {
                distancia = calcularDistancia(viajeInicioCoords.lat, viajeInicioCoords.lng, latFin, lngFin);
            }
            let duracion = 0;
            if (viajeInicioTime) {
                const diffMs = new Date() - viajeInicioTime;
                duracion = Math.floor(diffMs / 60000); 
            }

            const datos = {
                id_viaje: viajeActualId,
                monto: parseFloat(montoInput),
                metodo_pago_id: metodoId,
                lat: latFin,
                lng: lngFin,
                distancia_km: distancia,
                duracion_min: duracion,
                destino_texto: destinoManual 
            };

            const response = await fetch(`${API_URL}/finalizar`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });

            const resultado = await response.json();

            if (resultado.success) {
                notificar("🏁 Carrera finalizada. Calculando cobro...", "exito");
                
                const modalEl = document.getElementById('modalCobrar');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();

                mostrarPanelInicio();
                
                // Actualizamos otros módulos si existen (Finanzas)
                if(typeof cargarHistorial === 'function') cargarHistorial();
                if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria(); 

                setTimeout(() => {
                    btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
                    btnCobrar.innerHTML = textoBtn;
                    btnCobrar.disabled = false;
                }, 500);

            } else {
                notificar("❌ Error: " + resultado.message, "error");
                btnCobrar.disabled = false;
                btnCobrar.innerHTML = textoBtn;
                btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
            }

        } catch (error) {
            console.error(error);
            notificar("❌ Error de conexión", "error");
            btnCobrar.disabled = false;
        }
    }, (err) => {
        console.warn("GPS falló al cerrar");
        notificar("GPS Lento: Intenta de nuevo", "info");
        btnCobrar.disabled = false;
        btnCobrar.innerHTML = textoBtn;
        btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
    }, opcionesGPS);
}

// 4. RECUPERAR ESTADO DE VIAJE AL RECARGAR (IMPORTANTE)
async function verificarViajeEnCurso() {
    try {
        const response = await fetch(`${API_URL}/activo`);
        const result = await response.json();

        if (result.success && result.viaje) {
            const v = result.viaje;
            viajeActualId = v.id;
            viajeInicioTime = new Date(v.fecha_hora_inicio);

            if (v.lat_inicio && v.lng_inicio) {
                viajeInicioCoords = { lat: parseFloat(v.lat_inicio), lng: parseFloat(v.lng_inicio) };
            }

            console.log("♻️ Sesión recuperada. ID:", viajeActualId);
            
            // Restaurar Interfaz
            document.getElementById('btnIniciar').classList.add('d-none');
            const selector = document.getElementById('selectorApps');
            if(selector) selector.classList.add('d-none');
            
            document.getElementById('panelEnCarrera').classList.remove('d-none');
            
            // Recalcular tiempo
            const ahora = new Date();
            let diffMs = ahora - viajeInicioTime;
            let diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 0) diffMin = 0; 

            document.getElementById('txtCronometro').innerText = `En curso: Recuperado (${diffMin} min)`;
            notificar("🔄 Viaje activo restaurado", "info");

        } else {
            mostrarPanelInicio();
        }
    } catch (e) { console.error("Error recuperando sesión:", e); }
}

// 5. ANULAR VIAJE (Borrar)
async function anularCarrera(id) {
    if(confirm("¿Borrar carrera?")) {
        await fetch(`${API_URL}/anular/${id}`, { method: 'DELETE' });
        // Recargar datos financieros
        if(typeof cargarHistorial === 'function') cargarHistorial();
        if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
    }
}

// 6. VER MAPA (Historial)
async function verMapa(idViaje) {
    const modalEl = document.getElementById('modalMapa');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    try {
        const response = await fetch(`${API_URL}/ruta/${idViaje}`);
        const resultado = await response.json();

        if (resultado.success) {
            const puntos = resultado.data;
            if (puntos.length === 0) {
                document.getElementById('mapaLeaflet').innerHTML = '<div class="text-white p-5 text-center">No hay datos GPS.</div>';
                return;
            }

            setTimeout(() => {
                if (mapaGlobal) mapaGlobal.remove();
                
                const latInicio = parseFloat(puntos[0].lat);
                const lngInicio = parseFloat(puntos[0].lng);
                mapaGlobal = L.map('mapaLeaflet').setView([latInicio, lngInicio], 15);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(mapaGlobal);

                let coordenadasLinea = [];

                puntos.forEach(p => {
                    const lat = parseFloat(p.lat);
                    const lng = parseFloat(p.lng);
                    coordenadasLinea.push([lat, lng]);

                    if (p.tipo === 'INICIO') { 
                        L.marker([lat, lng], { title: 'Inicio' }).addTo(mapaGlobal).bindPopup(`<b>🏁 Inicio</b><br>${p.fecha}`);
                    } 
                    else if (p.tipo === 'FIN') { 
                         L.marker([lat, lng], { title: 'Fin' }).addTo(mapaGlobal).bindPopup(`<b>🏁 Destino</b><br>${p.fecha}`).openPopup();
                    } 
                    else {
                        L.circleMarker([lat, lng], { color: 'yellow', radius: 5 }).addTo(mapaGlobal);
                    }
                });

                if (coordenadasLinea.length > 1) {
                    const polyline = L.polyline(coordenadasLinea, { color: 'blue', weight: 4 }).addTo(mapaGlobal);
                    mapaGlobal.fitBounds(polyline.getBounds());
                }
                mapaGlobal.invalidateSize();

            }, 300);

        } else {
            notificar("Error cargando ruta","error");
        }
    } catch (e) {
        console.error(e);
        notificar("Error de conexión","error");
    }
}