// ==========================================
// MÓDULO: GESTIÓN (METAS, DEUDAS, CONTRATOS, ADMIN)
// ==========================================

// 1. METAS Y OBJETIVOS
async function cargarControlMetas() {
    const cont = document.getElementById('contenedorMetas'); if (!cont) return;
    try {
        const res = await fetch(`${API_URL}/finanzas/metas`);
        const r = await res.json();
        if (r.success) {
            if (r.data.length === 0) { cont.innerHTML = '<div class="text-center text-muted small">Sin objetivos.</div>'; return; }
            let html = '';
            r.data.forEach(m => {
                let col = 'bg-danger', txt = 'Fondo bajo...';
                if (m.porcentaje > 25) { col = 'bg-warning'; txt = 'En proceso...'; }
                if (m.porcentaje > 50) { col = 'bg-info'; txt = 'Saludable'; }
                if (m.porcentaje > 80) { col = 'bg-success'; txt = 'Robusto'; }
                if (m.porcentaje >= 100) txt = 'COMPLETO';
                const nom = m.nombre.replace(/💰|📉|🛠️|🎓/g, '').trim();
                html += `<div class="mb-3"><div class="d-flex justify-content-between align-items-end mb-1"><div><div class="small fw-bold text-white text-uppercase">${nom}</div><div class="text-muted d-flex align-items-center" style="font-size: 0.7rem;">Meta: S/ ${m.total.toLocaleString()}<button class="btn btn-link p-0 ms-2 text-info" onclick="abrirModalMeta(${m.id}, '${nom}', ${m.total})" style="font-size:0.8rem;"><i class="fas fa-pencil-alt"></i></button></div></div><div class="text-end"><div class="fw-bold text-white">S/ ${m.ahorrado.toLocaleString()}</div><div class="text-danger small fw-bold" style="font-size: 0.7rem;">Falta: S/ ${m.restante.toLocaleString()}</div></div></div><div class="progress bg-secondary bg-opacity-25" style="height: 12px; border-radius: 6px;"><div class="progress-bar ${col} progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${m.porcentaje}%"></div></div><div class="d-flex justify-content-between mt-1"><small class="text-white" style="font-size: 0.7rem;">${m.porcentaje}%</small><small class="text-muted fst-italic" style="font-size: 0.7rem;">${txt}</small></div></div>`;
            });
            cont.innerHTML = html;
        }
    } catch (e) { console.error(e); }
}

function abrirModalMeta(id, nom, monto) {
    document.getElementById('hdnCuentaIdMeta').value = id;
    document.getElementById('lblNombreCuentaMeta').innerText = nom;
    document.getElementById('inputNuevaMeta').value = monto;
    new bootstrap.Modal(document.getElementById('modalEditarMeta')).show();
    setTimeout(() => document.getElementById('inputNuevaMeta').select(), 500);
}

async function guardarMetaEditada() {
    const id = document.getElementById('hdnCuentaIdMeta').value;
    const nm = document.getElementById('inputNuevaMeta').value;
    if (nm && nm > 0) {
        try {
            const res = await fetch(`${API_URL}/finanzas/metas/editar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuenta_id: parseInt(id), nuevo_monto: parseFloat(nm) }) });
            if ((await res.json()).success) {
                bootstrap.Modal.getInstance(document.getElementById('modalEditarMeta')).hide();
                notificar("✅ Objetivo actualizado", "exito");
                cargarControlMetas();
            } else notificar("Error al actualizar", "error");
        } catch (e) { notificar("Error conexión", "error"); }
    }
}

// 2. GESTIÓN DE CUENTAS (ADMIN)
async function abrirGestionCuentas() {
    new bootstrap.Modal(document.getElementById('modalGestionCuentas')).show();
    cargarListaCuentasAdmin();
}

async function cargarListaCuentasAdmin() {
    const cont = document.getElementById('listaCuentasAdmin');
    cont.innerHTML = '<div class="text-center p-3">Cargando...</div>';
    try {
        const res = await fetch(`${API_URL}/cuentas/listar`);
        const r = await res.json();
        if (r.success) {
            let html = '';
            r.data.forEach(c => {
                const op = c.activo ? '1' : '0.5', ico = c.activo ? 'fa-eye text-success' : 'fa-eye-slash text-secondary', cls = c.activo ? 'text-white' : 'text-muted text-decoration-line-through';
                html += `<div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center py-2" style="opacity: ${op}"><div class="d-flex align-items-center"><button class="btn btn-sm btn-link text-decoration-none p-0 me-3" onclick="toggleEstadoCuenta(${c.id}, ${c.activo})"><i class="fas ${ico}"></i></button><div class="me-2"><input type="text" id="editNombre_${c.id}" value="${c.nombre}" class="form-control form-control-sm bg-transparent border-0 ${cls} p-0 fw-bold" onchange="guardarCuenta(${c.id})"></div></div><span class="badge bg-secondary rounded-pill" style="font-size: 0.65rem;">${c.tipo}</span></div>`;
            });
            cont.innerHTML = html;
        }
    } catch (e) { console.error(e); }
}

async function guardarCuenta(id) {
    let datos = id ? { id, nombre: document.getElementById(`editNombre_${id}`).value } : { nombre: document.getElementById('newNombreCuenta').value, tipo: document.getElementById('newTipoCuenta').value };
    if (!datos.nombre) return notificar("Falta nombre", "error");
    try {
        const res = await fetch(`${API_URL}/cuentas/guardar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
        if ((await res.json()).success) {
            if(!id) { document.getElementById('newNombreCuenta').value = ''; notificar("✅ Cuenta creada", "exito"); cargarListaCuentasAdmin(); }
            else notificar("✅ Actualizado", "exito");
            if(typeof cargarResumenDia === 'function') cargarResumenDia();
        }
    } catch (e) { notificar("Error", "error"); }
}

async function toggleEstadoCuenta(id, actual) {
    try {
        const res = await fetch(`${API_URL}/cuentas/estado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, activo: actual ? 0 : 1 }) });
        if (res.ok) cargarListaCuentasAdmin();
    } catch (e) {}
}

// 3. OBLIGACIONES Y DEUDAS
async function abrirObligaciones() {
    new bootstrap.Modal(document.getElementById('modalObligaciones')).show();
    cargarObligaciones();
}

async function cargarObligaciones() {
    const cont = document.getElementById('listaObligaciones');
    const verTodos = document.getElementById('chkVerTodos') ? document.getElementById('chkVerTodos').checked : false;
    
    // Anti-caché timestamp
    try {
        const res = await fetch(`${API_URL}/obligaciones?t=${new Date().getTime()}`);
        const r = await res.json();
        
        // Badge Rojo
        const badge = document.getElementById('badgeDeudasCount');
        if (badge) {
            const n = r.data ? r.data.length : 0;
            badge.innerText = n;
            badge.style.display = n > 0 ? 'inline-block' : 'none';
        }

        if (r.success && r.data.length > 0) {
            let html = '', mostrados = {};
            const lista = r.data.sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
            let ocultos = 0;

            lista.forEach(i => {
                const dias = parseInt(i.dias_restantes);
                let show = true;
                // Lógica de ocultar cuotas futuras
                if (!verTodos && i.compromiso_id) {
                    if (dias >= 0) {
                        if (mostrados[i.compromiso_id]) { show = false; ocultos++; }
                        else mostrados[i.compromiso_id] = true;
                    }
                }
                if (!show) return;

                let bord = 'border-success', badg = `<span class="badge bg-success mb-1">📅 ${dias} días</span>`;
                if (i.prioridad === 'URGENTE' || dias < 3) { bord = 'border-danger'; badg = `<span class="badge bg-danger mb-1">🔥 Vence en ${dias}</span>`; }
                else if (i.prioridad === 'ALTA' || dias < 7) { bord = 'border-warning'; badg = `<span class="badge bg-warning text-dark mb-1">⚠️ ${dias} días</span>`; }
                if (dias < 0) { bord = 'border-danger'; badg = `<span class="badge bg-danger w-100 mb-1">¡VENCIDO!</span>`; }

                const fecha = new Date(new Date(i.fecha_vencimiento).getTime() + (new Date().getTimezoneOffset() * 60000)).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit', year:'numeric'});

                html += `<div class="list-group-item bg-dark text-white p-3 mb-2 shadow-sm border-start border-4 ${bord}"><div class="d-flex justify-content-between align-items-center"><div style="flex: 1;">${badg}<h6 class="mb-1 fw-bold text-white">${i.titulo}</h6><div class="text-info small"><i class="far fa-calendar-alt me-1"></i>${fecha}</div></div><div class="text-end ms-3"><div class="fs-4 fw-bold text-white mb-2">S/ ${parseFloat(i.monto).toFixed(2)}</div><button class="btn btn-sm btn-outline-light w-100" onclick="pagarDeuda(${i.id}, ${i.monto}, '${i.titulo}')">PAGAR <i class="fas fa-chevron-right ms-1"></i></button></div></div></div>`;
            });
            if(ocultos > 0) html += `<div class="text-center text-muted small mt-2 fst-italic">Hay ${ocultos} cuotas futuras ocultas.</div>`;
            if(cont) cont.innerHTML = html;
        } else if(cont) cont.innerHTML = '<div class="text-center p-5 text-muted"><i class="fas fa-check-circle fa-2x mb-3 text-success"></i><br>¡Todo pagado!</div>';
    } catch (e) { if(cont) cont.innerHTML = 'Error'; }
}

async function crearObligacion() {
    const t = document.getElementById('nuevaObliTitulo').value, m = document.getElementById('nuevaObliMonto').value, f = document.getElementById('nuevaObliFecha').value, p = document.getElementById('nuevaObliPrioridad').value;
    if(!t||!m||!f) return notificar("Datos incompletos", "error");
    try {
        const res = await fetch(`${API_URL}/obligaciones`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ titulo: t, monto: m, fecha: f, prioridad: p }) });
        if ((await res.json()).success) {
            document.getElementById('nuevaObliTitulo').value = ''; document.getElementById('nuevaObliMonto').value = ''; document.getElementById('nuevaObliFecha').value = '';
            await cargarObligaciones(); notificar("✅ Guardado", "exito");
        } else notificar("Error al guardar", "error");
    } catch (e) { notificar("Error conexión", "error"); }
}

async function pagarDeuda(id, monto, titulo) {
    const cId = prompt(`Pagar "${titulo}" (S/ ${monto}).\nOrigen:\n1: Efectivo\n2: Yape\n5: Warda Deuda`);
    if (!cId) return;
    if (confirm("¿Confirmar pago?")) {
        const res = await fetch(`${API_URL}/obligaciones/pagar`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id_obligacion: id, id_cuenta_origen: cId, monto }) });
        if((await res.json()).success) { notificar("✅ Pagado","exito"); cargarObligaciones(); } else notificar("Error", "error");
    }
}

// 4. CONTRATOS Y PRÉSTAMOS
function toggleTipoCompromiso() {
    const esServ = document.getElementById('tipoServicio').checked;
    const inp = document.getElementById('presCuotas');
    if (esServ) { inp.value = 12; inp.disabled = true; inp.placeholder = "12 Meses"; } 
    else { inp.value = ''; inp.disabled = false; inp.placeholder = "N° Cuotas"; }
}

async function crearPrestamo() {
    const tit = document.getElementById('presTitulo').value, mStr = document.getElementById('presMonto').value, dStr = document.getElementById('presDia').value;
    const esServ = document.getElementById('tipoServicio').checked;
    let cStr = document.getElementById('presCuotas').value; if(esServ) cStr="12";
    
    if(!tit||!mStr||!cStr||!dStr) return notificar("Datos incompletos", "error");
    const m = parseFloat(mStr), c = parseInt(cStr), d = parseInt(dStr), mt = m * c;

    if(confirm(`¿Generar? ${tit}, Mensual: ${m}`)) {
        try {
            const res = await fetch(`${API_URL}/compromisos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: tit, tipo: esServ?'SERVICIO_FIJO':'PRESTAMO', monto_total: mt, monto_cuota: m, cuotas_totales: c, dia_pago: d, warda_origen_id: null }) });
            if((await res.json()).success) { notificar("✅ Generado", "exito"); document.getElementById('presTitulo').value=''; cargarObligaciones(); } else notificar("Error", "error");
        } catch(e) { notificar("Error", "error"); }
    }
}

async function abrirModalContratos() {
    bootstrap.Modal.getInstance(document.getElementById('modalObligaciones')).hide();
    new bootstrap.Modal(document.getElementById('modalContratos')).show();
    cargarContratos();
}

async function cargarContratos() {
    const cont = document.getElementById('listaContratos'); cont.innerHTML = 'Cargando...';
    try {
        const res = await fetch(`${API_URL}/compromisos`); const r = await res.json();
        if (r.success && r.data.length > 0) {
            let html = '';
            r.data.forEach(c => {
                const ico = c.tipo === 'SERVICIO_FIJO' ? 'fa-mobile-alt' : 'fa-university';
                html += `<div class="list-group-item bg-dark text-white p-3 border-secondary d-flex justify-content-between align-items-center"><div><div class="fw-bold text-warning"><i class="fas ${ico} me-2"></i>${c.titulo}</div><div class="small text-muted">${c.tipo}</div><div class="small text-white">Cuota: <strong>S/ ${parseFloat(c.monto_cuota_aprox).toFixed(2)}</strong></div></div><div><button class="btn btn-outline-danger btn-sm" onclick="darBajaContrato(${c.id}, '${c.titulo}')"><i class="fas fa-ban me-1"></i> Cancelar</button></div></div>`;
            });
            cont.innerHTML = html;
        } else cont.innerHTML = '<div class="text-center p-4 text-muted">Sin contratos.</div>';
    } catch (e) { cont.innerHTML = 'Error'; }
}

async function darBajaContrato(id, tit) {
    if (confirm(`¿Cancelar "${tit}"? Se borrarán las cuotas futuras.`)) {
        try {
            const res = await fetch(`${API_URL}/compromisos/cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
            if ((await res.json()).success) { notificar("✅ Cancelado", "exito"); cargarContratos(); cargarObligaciones(); }
        } catch (e) { notificar("Error", "error"); }
    }
}