// ==========================================
// MÓDULO: EXTRAS (AUTO, HISTORIAL)
// ==========================================

// 1. MI AUTO
async function cargarEstadoVehiculo() {
    try {
        const res = await fetch(`${API_URL}/vehiculo`);
        const r = await res.json();
        if (r.success) {
            const d = r.data;
            // Odómetro
            document.getElementById('lblOdometro').innerText = d.odometro.toLocaleString();
            document.getElementById('lblProximoCambio').innerText = d.proximo_cambio.toLocaleString();
            
            // Barra Aceite
            const barra = document.getElementById('barraAceite');
            document.getElementById('lblPorcentajeAceite').innerText = d.porcentaje_vida.toFixed(0) + '%';
            barra.style.width = `${d.porcentaje_vida}%`;
            
            if (d.porcentaje_vida < 20) {
                barra.className = 'progress-bar bg-danger';
                document.getElementById('lblAlertaAceite').style.display = 'block';
            } else {
                barra.className = 'progress-bar bg-success';
                document.getElementById('lblAlertaAceite').style.display = 'none';
            }

            // Fechas Documentos
            const setFecha = (id, f) => document.getElementById(id).innerText = f ? new Date(f).toLocaleDateString() : '--';
            setFecha('fechaSoat', d.fecha_soat);
            setFecha('fechaRevision', d.fecha_revision);
            setFecha('fechaGnv', d.fecha_gnv);
            
            // Inputs Config
            if(d.fecha_soat) document.getElementById('inputSoat').value = d.fecha_soat.split('T')[0];
            if(d.fecha_revision) document.getElementById('inputRevision').value = d.fecha_revision.split('T')[0];
            if(d.fecha_gnv) document.getElementById('inputGnv').value = d.fecha_gnv.split('T')[0];
        }
    } catch (e) { console.error("Error auto", e); }
}

async function actualizarOdometro() {
    const act = parseInt(document.getElementById('lblOdometro').innerText.replace(/,/g,'')) || 0;
    const nuevo = prompt("🚗 Nuevo Kilometraje:", act);
    if(nuevo && parseInt(nuevo) > act) {
        await fetch(`${API_URL}/vehiculo/actualizar`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nuevo_km: parseInt(nuevo) })
        });
        notificar("✅ Kilometraje actualizado", "success");
        cargarEstadoVehiculo();
    }
}

async function registrarMantenimiento() {
    if(!confirm("⚠️ ¿Confirmas cambio de aceite?")) return;
    const km = prompt("Kilometraje ACTUAL del tablero:");
    if(km) {
        await fetch(`${API_URL}/vehiculo/mantenimiento`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nuevo_km: parseInt(km), intervalo_km: 5000 })
        });
        notificar("✅ Mantenimiento registrado", "success");
        cargarEstadoVehiculo();
    }
}

function configurarAuto() { new bootstrap.Modal(document.getElementById('modalConfigAuto')).show(); }

async function guardarDocumentos() {
    const data = {
        fecha_soat: document.getElementById('inputSoat').value,
        fecha_revision: document.getElementById('inputRevision').value,
        fecha_gnv: document.getElementById('inputGnv').value
    };
    await fetch(`${API_URL}/vehiculo/documentos`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    notificar("✅ Fechas guardadas", "success");
    cargarEstadoVehiculo();
    bootstrap.Modal.getInstance(document.getElementById('modalConfigAuto')).hide();
}

// 2. HISTORIAL
async function cargarHistorial() {
    const input = document.getElementById('filtroFechaHistorial');
    if(!input.value) input.value = new Date(new Date().getTime() - 5*3600000).toISOString().split('T')[0];
    
    const res = await fetch(`${API_URL}/historial?fecha=${input.value}`);
    const r = await res.json();
    
    const lista = document.getElementById('listaHistorial');
    lista.innerHTML = '';
    
    if(r.success && r.data.length > 0) {
        document.getElementById('msgVacio').classList.add('d-none');
        r.data.forEach(v => {
            lista.innerHTML += `
            <div class="card bg-dark border-secondary mb-2">
                <div class="card-body p-2 d-flex align-items-center justify-content-between">
                    <div>
                        <span class="badge bg-secondary">${v.origen_tipo}</span>
                        <span class="text-white fw-bold ms-2">${v.hora_fin}</span>
                    </div>
                    <div class="d-flex align-items-center">
                        <span class="text-success fw-bold me-3">S/ ${parseFloat(v.monto_cobrado).toFixed(2)}</span>
                        <button class="btn btn-sm btn-outline-warning p-1 me-1" onclick="verMapa(${v.id})"><i class="fas fa-map"></i></button>
                        <button class="btn btn-sm btn-outline-danger p-1" onclick="anularCarrera(${v.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        });
    } else {
        document.getElementById('msgVacio').classList.remove('d-none');
    }
}

async function anularCarrera(id) {
    if(confirm("¿Eliminar carrera?")) {
        await fetch(`${API_URL}/anular/${id}`, { method: 'DELETE' });
        cargarHistorial();
        if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
    }
}