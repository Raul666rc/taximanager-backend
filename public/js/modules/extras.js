// ==========================================
// MÓDULO: EXTRAS (AUTO, HISTORIAL, MANTENIMIENTO)
// ==========================================

// 1. MI AUTO
async function cargarEstadoVehiculo() {
    try {
        const res = await fetch(`${API_URL}/vehiculo`);
        const r = await res.json();
        if (r.success) {
            const d = r.data;
            // Odómetro
            const lblOdo = document.getElementById('lblOdometro');
            if (lblOdo) lblOdo.innerText = d.odometro.toLocaleString();
            
            const lblProx = document.getElementById('lblProximoCambio');
            if (lblProx) lblProx.innerText = d.proximo_cambio.toLocaleString();
            
            // Barra Aceite
            const barra = document.getElementById('barraAceite');
            const lblPorc = document.getElementById('lblPorcentajeAceite');
            const alertAceite = document.getElementById('lblAlertaAceite');

            if (barra && lblPorc) {
                lblPorc.innerText = d.porcentaje_vida.toFixed(0) + '%';
                barra.style.width = `${d.porcentaje_vida}%`;
                
                // Lógica de colores barra
                barra.className = 'progress-bar progress-bar-striped progress-bar-animated';
                if (d.porcentaje_vida > 50) {
                    barra.classList.add('bg-success');
                    if (alertAceite) alertAceite.style.display = 'none';
                } else if (d.porcentaje_vida > 20) {
                    barra.classList.add('bg-warning', 'text-dark');
                    if (alertAceite) alertAceite.style.display = 'none';
                } else {
                    barra.classList.add('bg-danger');
                    if (alertAceite) alertAceite.style.display = 'block';
                }
            }

            // Fechas Documentos
            const setFecha = (id, f) => {
                const el = document.getElementById(id);
                if(el) el.innerText = f ? new Date(f).toLocaleDateString('es-PE', {year:'numeric', month:'2-digit', day:'2-digit'}) : '--/--/--';
            };
            setFecha('fechaSoat', d.fecha_soat);
            setFecha('fechaRevision', d.fecha_revision);
            setFecha('fechaGnv', d.fecha_gnv);
            
            // Inputs Config (Para el modal)
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
    
    const act = parseInt(document.getElementById('lblOdometro').innerText.replace(/,/g,'')) || 0;
    const km = prompt("1️⃣ Kilometraje ACTUAL del tablero:", act);
    if(!km) return;
    
    const intervalo = prompt("2️⃣ ¿Cada cuántos Km?", "5000");
    if(!intervalo) return;

    try {
        const res = await fetch(`${API_URL}/vehiculo/mantenimiento`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nuevo_km: parseInt(km), intervalo_km: parseInt(intervalo) })
        });
        const r = await res.json();
        if(r.success) {
            notificar("✅ Mantenimiento registrado", "success");
            cargarEstadoVehiculo();
        } else {
            notificar("Error: " + r.message, "error");
        }
    } catch (e) { notificar("Error conexión", "error"); }
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


// ==========================================
// 3. DETALLE DE MANTENIMIENTO (NUEVO)
// ==========================================

// Detectar apertura del modal para cargar datos
const modalMant = document.getElementById('modalDetalleMantenimiento');
if (modalMant) {
    modalMant.addEventListener('show.bs.modal', renderizarMantenimientoDetallado);
}

function renderizarMantenimientoDetallado() {
    const container = document.getElementById('listaMantenimientosContainer');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-3 text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Calculando desgaste...</div>';

    // 1. Obtener Km Actual
    const kmStr = document.getElementById('lblOdometro').innerText.replace(/,/g, '');
    const kmActual = parseInt(kmStr) || 0;

    // 2. Definir Reglas de Mantenimiento (TUCSON / AUTO GENERAL)
    const items = [
        { nombre: 'Aceite Motor',       intervalo: 5000,   icon: 'fa-oil-can',      color: 'text-warning' },
        { nombre: 'Filtro de Aire',     intervalo: 10000,  icon: 'fa-wind',         color: 'text-info' },
        { nombre: 'Filtro de Cabina',   intervalo: 15000,  icon: 'fa-fan',          color: 'text-light' },
        { nombre: 'Bujías',             intervalo: 40000,  icon: 'fa-fire',         color: 'text-danger' },
        { nombre: 'Refrigerante',       intervalo: 40000,  icon: 'fa-snowflake',    color: 'text-primary' },
        { nombre: 'Líquido de Frenos',  intervalo: 30000,  icon: 'fa-tint',         color: 'text-danger' },
        { nombre: 'Aceite de Caja',     intervalo: 60000,  icon: 'fa-cogs',         color: 'text-secondary' }
    ];

    let html = '';

    items.forEach(item => {
        // Cálculo matemático simple: ¿Dónde estoy en el ciclo actual?
        // Ejemplo: Si tengo 12,000km y el intervalo es 10,000. 
        // 12000 % 10000 = 2000km recorridos del nuevo ciclo.
        const kmRecorridosCiclo = kmActual % item.intervalo;
        const kmRestantes = item.intervalo - kmRecorridosCiclo;
        const porcentajeUso = (kmRecorridosCiclo / item.intervalo) * 100;

        // Determinar estado visual
        let estadoColor = 'bg-success';
        let textoEstado = 'OK';
        let borde = 'border-secondary';

        if (porcentajeUso > 75) { 
            estadoColor = 'bg-warning'; 
            textoEstado = 'Atención'; 
            borde = 'border-warning';
        }
        if (porcentajeUso > 90) { 
            estadoColor = 'bg-danger'; 
            textoEstado = 'Cambiar'; 
            borde = 'border-danger';
        }

        html += `
        <div class="card bg-dark ${borde} mb-2 shadow-sm">
            <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div class="d-flex align-items-center">
                        <i class="fas ${item.icon} ${item.color} me-2" style="width: 20px; text-align: center;"></i>
                        <span class="fw-bold text-white small">${item.nombre}</span>
                    </div>
                    <span class="badge ${estadoColor} text-dark" style="font-size: 0.7rem;">${textoEstado}</span>
                </div>
                
                <div class="progress bg-secondary bg-opacity-25" style="height: 6px;">
                    <div class="progress-bar ${estadoColor}" style="width: ${porcentajeUso}%"></div>
                </div>
                
                <div class="d-flex justify-content-between mt-1">
                    <small class="text-muted" style="font-size: 0.65rem;">Intervalo: ${item.intervalo / 1000}k</small>
                    <small class="text-white fw-bold" style="font-size: 0.65rem;">Faltan: ${kmRestantes.toLocaleString()} km</small>
                </div>
            </div>
        </div>`;
    });

    // 3. Renderizar
    setTimeout(() => {
        container.innerHTML = html;
    }, 500); // Pequeño delay para efecto visual
}


// ==========================================
// 4. HISTORIAL DE VIAJES
// ==========================================
async function cargarHistorial() {
    const input = document.getElementById('filtroFechaHistorial');
    if(!input.value) {
        const hoy = new Date();
        hoy.setHours(hoy.getHours() - 5);
        input.value = hoy.toISOString().split('T')[0];
    }
    
    try {
        const res = await fetch(`${API_URL}/historial?fecha=${input.value}`);
        const r = await res.json();
        
        const lista = document.getElementById('listaHistorial');
        const msgVacio = document.getElementById('msgVacio');
        
        if(!lista) return;
        lista.innerHTML = '';
        
        if(r.success && r.data.length > 0) {
            msgVacio.classList.add('d-none');
            
            r.data.forEach(viaje => {
                let badgeColor = 'bg-secondary';
                if(viaje.origen_tipo === 'INDRIVER') badgeColor = 'bg-success';
                if(viaje.origen_tipo === 'UBER') badgeColor = 'bg-light text-dark';
                if(viaje.origen_tipo === 'CALLE') badgeColor = 'bg-warning text-dark';
                if(viaje.origen_tipo === 'OTROS') badgeColor = 'bg-info text-dark';

                const iconoPago = viaje.metodo_cobro_id === 1 
                    ? '<i class="fas fa-money-bill-wave text-success"></i>' 
                    : '<i class="fas fa-qrcode text-warning"></i>';

                const html = `
                <div class="card bg-dark border-secondary mb-2 shadow-sm">
                    <div class="card-body p-2 d-flex align-items-center">
                        <div class="me-3 d-flex flex-column gap-2">
                            <button class="btn btn-outline-warning btn-sm border-0 p-1" onclick="verMapa(${viaje.id})">
                                <i class="fas fa-map-marked-alt fa-lg"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm border-0 p-1" onclick="anularCarrera(${viaje.id})">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div class="d-flex flex-column flex-grow-1">
                            <div class="mb-1">
                                <span class="badge ${badgeColor}">${viaje.origen_tipo}</span>
                            </div>
                            <div class="text-info small fw-bold" style="font-size: 0.8rem;">
                                <i class="far fa-clock me-1"></i>${viaje.hora_fin}
                            </div>
                            ${viaje.origen_texto ? `<div class="text-muted text-truncate" style="font-size: 0.7rem; max-width: 150px;"><i class="fas fa-map-pin me-1 text-danger"></i>${viaje.origen_texto}</div>` : ''}
                        </div>
                        <div class="text-end ms-2">
                            <div class="fw-bold text-white fs-5 lh-1">S/ ${parseFloat(viaje.monto_cobrado).toFixed(2)}</div>
                            <div class="mt-1 fs-5">${iconoPago}</div>
                        </div>
                    </div>
                </div>`;
                lista.innerHTML += html;
            });
        } else {
            msgVacio.classList.remove('d-none');
        }
    } catch(e) { console.error("Error historial", e); }
}

async function anularCarrera(id) {
    // Usamos el nuevo modal si existe, o el confirm
    if (typeof abrirConfirmarCancelacion === 'function') {
        // Adaptación: como el modal es para "carrera actual", mejor usamos un confirm simple aquí para historial
        if(confirm("¿Eliminar carrera del historial?")) {
            await fetch(`${API_URL}/anular/${id}`, { method: 'DELETE' });
            cargarHistorial();
            if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
        }
    } else {
        if(confirm("¿Eliminar carrera?")) {
            await fetch(`${API_URL}/anular/${id}`, { method: 'DELETE' });
            cargarHistorial();
        }
    }
}