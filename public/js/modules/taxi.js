// ==========================================
// MÓDULO: TAXI (GPS, CRONÓMETRO, MAPA)
// ==========================================

let viajeActualId = null;
let viajeInicioCoords = null;
let viajeInicioTime = null;
let mapaGlobal = null;

// ==========================================
// 1. INICIAR CARRERA (AHORA A PRUEBA DE FALLOS)
// ==========================================
async function iniciarCarrera() {
    // Validación básica de navegador
    if (!navigator.geolocation) return notificar("Tu celular no tiene GPS", "error");

    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    const btn = document.getElementById('btnIniciar');
    
    // 1. Feedback visual inmediato
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin fa-3x mb-2"></i><span class="fs-4">Conectando...</span>';
    btn.disabled = true;

    // LÓGICA INTERNA: Enviar al servidor (con o sin coordenadas)
    const procesarInicio = async (lat, lng) => {
        try {
            // Guardamos hora local para cálculos inmediatos
            viajeInicioCoords = { lat, lng };
            viajeInicioTime = new Date();

            const response = await fetch(`${API_URL}/iniciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    origen_tipo: appSeleccionada,
                    lat: lat,
                    lng: lng
                })
            });

            const resultado = await response.json();

            if (resultado.success) {
                viajeActualId = resultado.data.id_viaje;
                
                // TRANSICIÓN DE PANTALLA
                document.getElementById('selectorApps').classList.add('d-none');
                document.getElementById('btnIniciar').classList.add('d-none');
                document.getElementById('panelEnCarrera').classList.remove('d-none');
                document.getElementById('txtCronometro').innerText = "En curso: " + new Date().toLocaleTimeString();
                
                notificar("🚖 ¡Carrera Iniciada!", "success");
            } else {
                throw new Error(resultado.message);
            }

        } catch (error) { 
            console.error(error);
            notificar("Error al iniciar: " + error.message, "error");
            restaurarBotonInicio(); // Si falla el server, devolvemos el botón a la normalidad
        }
    };

    // 2. Intentar GPS Rápido (Máximo 3 segundos)
    const opcionesGPS = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            // ÉXITO GPS
            procesarInicio(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
            // FALLO GPS: Arrancamos igual con coordenadas 0,0
            console.warn("GPS lento al iniciar, arrancando sin ubicación.", err);
            notificar("⚠️ GPS lento. Iniciando sin ubicación.", "info");
            procesarInicio(0, 0);
        },
        opcionesGPS
    );
}

// Función auxiliar para dejar el botón listo para la próxima
function restaurarBotonInicio() {
    const btn = document.getElementById('btnIniciar');
    btn.classList.remove('d-none');
    btn.disabled = false;
    // CORRECCIÓN: Restauramos el HTML original exacto (Icono grande y texto)
    btn.innerHTML = '<i class="fas fa-power-off fa-4x mb-2"></i><span class="fw-bold fs-3">INICIAR</span>';
}


// ==========================================
// 2. REGISTRAR PARADA (OPTIMIZADO)
// ==========================================
async function registrarParada() {
    if (!viajeActualId) return;

    // No bloqueamos la UI para que sea fluido, solo notificamos si falla
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
        } catch (e) { console.error(e); }
    }, (err) => {
        // Si falla GPS en parada, no es crítico, solo avisamos
        notificar("⚠️ No se pudo guardar la ubicación de la parada", "warning");
    }, opcionesGPS);
}


// ==========================================
// 3. FINALIZAR (BLINDADO A PRUEBA DE FALLOS)
// ==========================================
async function guardarCarrera() {
    const monto = document.querySelector('#modalCobrar input[type="number"]').value;
    const esYape = document.getElementById('pago2').checked;
    
    if (!monto) return notificar("Ingresa el monto", "error");

    // Bloqueo visual inmediato
    const btnModal = document.querySelector('#modalCobrar .btn-success');
    const textoOriginalModal = btnModal.innerHTML;
    btnModal.disabled = true; 
    btnModal.className = 'btn btn-warning w-100 btn-lg fw-bold';
    btnModal.innerHTML = '<i class="fas fa-sync fa-spin"></i> Guardando...';

    const finalizarEnServidor = async (lat, lng) => {
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
                notificar("🏁 Carrera Finalizada", "success");
                
                // 1. Cerrar Modal
                const modalEl = document.getElementById('modalCobrar');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                
                // 2. RESTAURAR INTERFAZ PRINCIPAL (CORRECCIÓN CRÍTICA)
                document.getElementById('panelEnCarrera').classList.add('d-none');
                document.getElementById('selectorApps').classList.remove('d-none');
                
                // AQUÍ ESTABA EL PROBLEMA: Llamamos a la función que limpia el botón
                restaurarBotonInicio(); 
                
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
            notificar("Error de conexión", "error");
        } finally {
            // Restaurar botón del modal
            setTimeout(() => {
                btnModal.disabled = false; 
                btnModal.className = 'btn btn-success w-100 btn-lg fw-bold';
                btnModal.innerHTML = textoOriginalModal; 
            }, 500);
        }
    };

    // Intentamos GPS Rápido
    const opcionesGPS = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(
        (pos) => finalizarEnServidor(pos.coords.latitude, pos.coords.longitude), 
        (err) => {
            console.warn("GPS falló al finalizar, enviando sin ubicación.", err);
            finalizarEnServidor(0, 0); // Guardar de todas formas
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
            
            // Ocultar inicio, mostrar carrera
            document.getElementById('selectorApps').classList.add('d-none');
            document.getElementById('btnIniciar').classList.add('d-none');
            document.getElementById('panelEnCarrera').classList.remove('d-none');
            
            document.getElementById('txtCronometro').innerText = "Recuperado: " + viajeInicioTime.toLocaleTimeString();
            console.log("♻️ Viaje recuperado ID:", viajeActualId);
        } else {
            // Si no hay viaje, asegurarnos que el botón de inicio esté bien
            restaurarBotonInicio();
        }
    } catch (e) { 
        console.error(e);
        restaurarBotonInicio(); // Por seguridad
    }
}

// 5. VER MAPA
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
                const latIni = parseFloat(pts[0].lat);
                const lngIni = parseFloat(pts[0].lng);
                
                mapaGlobal = L.map('mapaLeaflet').setView([latIni, lngIni], 14);
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
        } else {
            document.getElementById('mapaLeaflet').innerHTML = '<div class="text-white p-5 text-center">Sin datos de ruta GPS.</div>';
        }
    } catch(e) { document.getElementById('mapaLeaflet').innerHTML = '<div class="text-danger p-5 text-center">Error cargando mapa.</div>'; }
}