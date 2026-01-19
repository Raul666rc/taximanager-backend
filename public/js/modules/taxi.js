// ==========================================
// MÓDULO: TAXI (GPS, CRONÓMETRO, MAPA)
// ==========================================

let viajeActualId = null;
let viajeInicioCoords = null;
let viajeInicioTime = null;
let mapaGlobal = null;

// 1. INICIAR CARRERA
async function iniciarCarrera() {
    if (!navigator.geolocation) return notificar("Sin GPS", "error");

    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    const btn = document.getElementById('btnIniciar');
    const txtOriginal = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> GPS...';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                viajeInicioCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
                viajeInicioTime = new Date();

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
                    
                    document.getElementById('selectorApps').classList.add('d-none');
                    document.getElementById('btnIniciar').classList.add('d-none');
                    document.getElementById('panelEnCarrera').classList.remove('d-none');
                    document.getElementById('txtCronometro').innerText = "En curso: " + new Date().toLocaleTimeString();
                    
                    notificar("🚖 ¡Carrera Iniciada!", "success");
                }
            } catch (error) { notificar("Error de conexión", "error"); } 
            finally { btn.innerHTML = txtOriginal; btn.disabled = false; }
        },
        (error) => { notificar("Error GPS: " + error.message, "error"); btn.disabled = false; btn.innerHTML = txtOriginal; },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// 2. REGISTRAR PARADA
async function registrarParada() {
    if (!viajeActualId) return;
    try {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            await fetch(`${API_URL}/parada`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_viaje: viajeActualId, lat: pos.coords.latitude, lng: pos.coords.longitude, tipo: 'PARADA' })
            });
            notificar("📍 Parada registrada", "info");
        });
    } catch (e) { notificar("Error GPS Parada", "error"); }
}

// 3. FINALIZAR
async function guardarCarrera() {
    const monto = document.querySelector('#modalCobrar input[type="number"]').value;
    const esYape = document.getElementById('pago2').checked;
    
    if (!monto) return notificar("Ingresa el monto", "error");

    const btn = document.querySelector('#modalCobrar .btn-success');
    btn.disabled = true; btn.innerHTML = 'Guardando...';

    navigator.geolocation.getCurrentPosition(async (pos) => {
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
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    duracion_min: duracion
                })
            });

            if ((await res.json()).success) {
                bootstrap.Modal.getInstance(document.getElementById('modalCobrar')).hide();
                notificar("🏁 Carrera Finalizada", "success");
                
                // Reset UI
                document.getElementById('panelEnCarrera').classList.add('d-none');
                document.getElementById('btnIniciar').classList.remove('d-none');
                document.getElementById('selectorApps').classList.remove('d-none');
                document.querySelector('#modalCobrar input[type="number"]').value = '';
                viajeActualId = null;

                if(typeof cargarHistorial === 'function') cargarHistorial();
                if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
            }
        } catch (e) { notificar("Error guardando", "error"); } 
        finally { btn.disabled = false; btn.innerHTML = 'REGISTRAR'; }
    });
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