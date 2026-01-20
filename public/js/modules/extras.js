// ==========================================
// MÓDULO: EXTRAS (AUTO, HISTORIAL, MANTENIMIENTO)
// ==========================================

// 1. MI AUTO (AHORA CON CÁLCULO DE VENCIMIENTOS LEGALES)
async function cargarEstadoVehiculo() {
    try {
        const res = await fetch(`${API_URL}/vehiculo`);
        const r = await res.json();
        if (r.success) {
            const d = r.data;
            
            // --- A. KILOMETRAJE Y ACEITE (Lógica existente) ---
            const lblOdo = document.getElementById('lblOdometro');
            if (lblOdo) lblOdo.innerText = d.odometro.toLocaleString();
            
            const lblProx = document.getElementById('lblProximoCambio');
            if (lblProx) lblProx.innerText = d.proximo_cambio.toLocaleString();
            
            const barra = document.getElementById('barraAceite');
            const lblPorc = document.getElementById('lblPorcentajeAceite');
            const alertAceite = document.getElementById('lblAlertaAceite');

            if (barra && lblPorc) {
                lblPorc.innerText = d.porcentaje_vida.toFixed(0) + '%';
                barra.style.width = `${d.porcentaje_vida}%`;
                
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

            // --- B. DOCUMENTOS LEGALES (NUEVA LÓGICA) ---
            
            // Función auxiliar para pintar los badges
            const actualizarBadge = (idBadge, idTexto, fechaStr) => {
                const badge = document.getElementById(idBadge);
                const texto = document.getElementById(idTexto);
                
                if (!badge || !texto) return;

                if (!fechaStr) {
                    texto.innerText = "--/--/--";
                    badge.innerText = "Sin Datos";
                    badge.className = "badge bg-secondary rounded-pill px-3";
                    return;
                }

                // 1. Poner fecha bonita
                const fechaVenc = new Date(fechaStr);
                // Ajuste de zona horaria simple para evitar desfases de día
                const fechaVencLocal = new Date(fechaVenc.getTime() + (fechaVenc.getTimezoneOffset() * 60000));
                
                texto.innerText = fechaVencLocal.toLocaleDateString('es-PE', {year:'numeric', month:'2-digit', day:'2-digit'});

                // 2. Calcular días restantes
                const hoy = new Date();
                const diffTime = fechaVenc - hoy;
                const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // 3. Decidir color y texto del badge
                if (diasRestantes < 0) {
                    badge.className = "badge bg-danger rounded-pill px-3 animate__animated animate__pulse animate__infinite";
                    badge.innerText = "¡VENCIDO!";
                } else if (diasRestantes <= 7) {
                    badge.className = "badge bg-danger text-white rounded-pill px-3";
                    badge.innerText = `${diasRestantes} días (URGENTE)`;
                } else if (diasRestantes <= 30) {
                    badge.className = "badge bg-warning text-dark rounded-pill px-3";
                    badge.innerText = `${diasRestantes} días`;
                } else {
                    badge.className = "badge bg-success rounded-pill px-3";
                    badge.innerText = "Vigente";
                }
            };

            // Ejecutar para los 3 documentos
            actualizarBadge('badgeSoat', 'fechaSoat', d.fecha_soat);
            actualizarBadge('badgeRevision', 'fechaRevision', d.fecha_revision);
            actualizarBadge('badgeGnv', 'fechaGnv', d.fecha_gnv);
            
            // Pre-llenar inputs del modal de configuración
            if(d.fecha_soat) document.getElementById('inputSoat').value = d.fecha_soat.split('T')[0];
            if(d.fecha_revision) document.getElementById('inputRevision').value = d.fecha_revision.split('T')[0];
            if(d.fecha_gnv) document.getElementById('inputGnv').value = d.fecha_gnv.split('T')[0];
        }
    } catch (e) { console.error("Error auto", e); }
}

// ==========================================
// LÓGICA DE MODALES DE MANTENIMIENTO (NUEVA)
// ==========================================

// 1. ABRIR MODAL CORREGIR KM
function actualizarOdometro() {
    // Leemos el valor actual para pre-llenar el input
    const textoActual = document.getElementById('lblOdometro').innerText.replace(/,/g,'');
    document.getElementById('inputNuevoKm').value = parseInt(textoActual) || 0;
    
    // Abrimos el modal bonito
    new bootstrap.Modal(document.getElementById('modalCorregirKm')).show();
    
    // Poner foco en el input automáticamente
    setTimeout(() => document.getElementById('inputNuevoKm').select(), 500);
}

// 2. GUARDAR CORRECCIÓN (Acción del botón modal)
// ==========================================
// CORRECCIÓN DE KILOMETRAJE (LÓGICA PREMIUM)
// ==========================================

async function guardarCorreccionKm(confirmado = false) {
    const inputNuevo = document.getElementById('inputNuevoKm');
    const nuevo = parseInt(inputNuevo.value);
    
    // Obtenemos el actual limpiando comas si las hubiera
    const actual = parseInt(document.getElementById('lblOdometro').innerText.replace(/,/g,'')) || 0;

    if (!nuevo || nuevo <= 0) return notificar("Ingresa un valor válido", "error");

    // --- VALIDACIÓN DE RETROCESO ---
    // Si el nuevo es menor Y NO hemos confirmado todavía...
    if (nuevo < actual && !confirmado) {
        
        // 1. Cerramos el modal de input para evitar superposición
        const modalInput = bootstrap.Modal.getInstance(document.getElementById('modalCorregirKm'));
        if (modalInput) modalInput.hide();

        // 2. Abrimos el modal de advertencia roja
        // Le damos un pequeño delay para que la transición sea suave
        setTimeout(() => {
            new bootstrap.Modal(document.getElementById('modalConfirmarRetroceso')).show();
        }, 200);
        
        return; // Detenemos aquí esperando la confirmación
    }

    // --- GUARDADO DEFINITIVO ---
    // Si llegamos aquí, es porque o el km es mayor, o ya confirmamos el retroceso.
    
    // Efecto visual en el botón que haya disparado la acción
    let btn;
    if (confirmado) {
        btn = document.querySelector('#modalConfirmarRetroceso .btn-danger');
    } else {
        btn = document.querySelector('#modalCorregirKm .btn-primary'); // O la clase que tenga tu botón de guardar normal
    }
    
    if(btn) {
        var txtOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
        await fetch(`${API_URL}/vehiculo/actualizar`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nuevo_km: nuevo })
        });
        
        notificar("✅ Kilometraje actualizado", "success");
        
        // CERRAR MODALES (Cualquiera que esté abierto)
        const modalRetroceso = bootstrap.Modal.getInstance(document.getElementById('modalConfirmarRetroceso'));
        if (modalRetroceso) modalRetroceso.hide();

        const modalInput = bootstrap.Modal.getInstance(document.getElementById('modalCorregirKm'));
        if (modalInput) modalInput.hide();
        
        // Limpieza Nuclear Anti-Congelamiento (Por si acaso)
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.overflow = 'auto';
        }, 300);

        cargarEstadoVehiculo(); // Refrescar pantalla
        
    } catch (e) { 
        console.error(e);
        notificar("Error de conexión", "error"); 
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = txtOriginal;
        }
    }
}

// 3. ABRIR MODAL MANTENIMIENTO
function registrarMantenimiento() {
    // 1. Obtener el KM actual del tablero (limpiando comas)
    const kmActual = parseInt(document.getElementById('lblOdometro').innerText.replace(/,/g,'')) || 0;
    
    // 2. Llenar el input
    document.getElementById('inputMantKm').value = kmActual;
    
    // 3. Mostrar Modal
    new bootstrap.Modal(document.getElementById('modalRegMantenimiento')).show();
    
    // 4. Seleccionar el texto para que si quieres corregir, solo escribas encima
    setTimeout(() => document.getElementById('inputMantKm').select(), 500);
}

// 4. GUARDAR MANTENIMIENTO (Acción del botón modal)
async function guardarMantenimiento() {
    const km = document.getElementById('inputMantKm').value;
    const intervalo = document.getElementById('inputMantIntervalo').value;

    if(!km || km <= 0) return notificar("Verifica el kilometraje", "error");

    const btn = document.querySelector('#modalRegMantenimiento .btn-warning');
    const txt = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const res = await fetch(`${API_URL}/vehiculo/mantenimiento`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nuevo_km: parseInt(km), intervalo_km: parseInt(intervalo) })
        });
        
        const r = await res.json();
        if(r.success) {
            notificar("✅ Mantenimiento registrado y reiniciado", "success");
            bootstrap.Modal.getInstance(document.getElementById('modalRegMantenimiento')).hide();
            cargarEstadoVehiculo(); // Refrescar barras
        } else {
            notificar("Error: " + r.message, "error");
        }
    } catch (e) { notificar("Error conexión", "error"); } 
    finally { btn.disabled = false; btn.innerHTML = txt; }
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