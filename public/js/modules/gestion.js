// ==========================================
// MÓDULO: GESTIÓN (ADMIN, DEUDAS, METAS)
// ==========================================

// 1. METAS FINANCIERAS (TARJETA OBJETIVOS)
async function cargarControlMetas() {
    const cont = document.getElementById('contenedorMetas');
    if (!cont) return;
    try {
        const res = await fetch(`${API_URL}/finanzas/metas`);
        const r = await res.json();
        if (r.success) {
            if (r.data.length === 0) { cont.innerHTML = '<div class="text-center small text-muted">Sin objetivos.</div>'; return; }
            let html = '';
            r.data.forEach(m => {
                let col = 'bg-danger', txt = 'Fondo bajo';
                if (m.porcentaje > 25) { col = 'bg-warning'; txt = 'En proceso'; }
                if (m.porcentaje > 50) { col = 'bg-info'; txt = 'Saludable'; }
                if (m.porcentaje > 80) { col = 'bg-success'; txt = 'Robusto'; }
                const nom = m.nombre.replace(/💰|📉|🛠️|🎓/g, '').trim(); // Limpiar emojis del nombre para evitar errores
                
                // NOTA: Pasamos los parámetros con cuidado
                html += `
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-end mb-1">
                        <div>
                            <div class="small fw-bold text-white text-uppercase">${nom}</div>
                            <div class="text-muted d-flex align-items-center" style="font-size: 0.7rem;">
                                Meta: S/ ${m.total.toLocaleString()} 
                                <button class="btn btn-link p-0 ms-2 text-info" onclick="abrirModalMeta('${m.id}', '${nom}', '${m.total}')"><i class="fas fa-pencil-alt"></i></button>
                            </div>
                        </div>
                        <div class="text-end">
                            <div class="fw-bold text-white">S/ ${m.ahorrado.toLocaleString()}</div>
                            <div class="text-danger small fw-bold" style="font-size: 0.7rem;">Falta: ${m.restante.toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="progress bg-secondary bg-opacity-25" style="height: 8px;">
                        <div class="progress-bar ${col}" style="width: ${m.porcentaje}%"></div>
                    </div>
                </div>`;
            });
            cont.innerHTML = html;
        }
    } catch (e) { console.error(e); }
}

// ABRIR EL MODAL (Método robusto)
function abrirModalMeta(id, nom, monto) {
    console.log("📝 Editando meta -> ID:", id, "Monto:", monto);

    // 1. Guardamos el ID en un atributo del modal (Más seguro que input hidden)
    const modalEl = document.getElementById('modalEditarMeta');
    modalEl.dataset.cuentaId = id;

    // 2. Llenamos los textos
    document.getElementById('lblNombreCuentaMeta').innerText = nom;
    document.getElementById('inputNuevaMeta').value = parseFloat(monto).toFixed(2);
    
    // 3. Mostramos
    new bootstrap.Modal(modalEl).show();
    setTimeout(() => document.getElementById('inputNuevaMeta').select(), 500);
}

// GUARDAR (Depuración activada)
async function guardarMetaEditada() {
    // 1. Recuperar datos
    const modalEl = document.getElementById('modalEditarMeta');
    const id = modalEl.dataset.cuentaId; // Recuperar del dataset
    const montoStr = document.getElementById('inputNuevaMeta').value;

    // 2. Validaciones
    if (!id || id === "undefined") {
        return notificar("Error: No se identificó la cuenta (ID perdido)", "error");
    }
    if (!montoStr || parseFloat(montoStr) < 0) {
        return notificar("Ingresa un monto válido", "error");
    }

    const btn = document.querySelector('#modalEditarMeta button.btn-info');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        // 3. Preparar Payload (Enviamos como número limpio)
        const payload = {
            cuenta_id: id,            // Enviamos el ID tal cual (el backend suele manejar strings numéricos bien)
            nuevo_monto: montoStr     // Enviamos el monto tal cual escribió el usuario
        };

        console.log("📤 Enviando:", payload); // MIRAR CONSOLA SI FALLA

        const res = await fetch(`${API_URL}/finanzas/metas/editar`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();

        if (data.success) {
            notificar("✅ Meta actualizada", "success");
            bootstrap.Modal.getInstance(modalEl).hide();
            await cargarControlMetas(); // Refrescar lista
            
            // Actualizar dashboard principal si existe
            if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
        } else {
            // Si el servidor se queja, mostramos qué dijo
            notificar("Error Servidor: " + (data.message || "Desconocido"), "error");
        }
    } catch (e) { 
        console.error(e);
        notificar("Error de conexión", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = txtOriginal;
    }
}

// --- Resto de funciones del módulo (Obligaciones, Cuentas, etc.) se mantienen igual ---
// Copia aquí el resto de funciones de gestion.js que tenías (abrirObligaciones, cargarObligaciones, etc.)
// Si necesitas que te pase el archivo COMPLETO con todo, pídemelo, pero lo importante era arreglar estas 3 funciones de arriba.

// ... (Pega aquí el resto del código de gestion.js desde 'abrirObligaciones' hacia abajo) ...
// Para facilitarte, te dejo las funciones restantes resumidas aquí abajo para que copies TODO el bloque si prefieres:

async function abrirObligaciones() {
    new bootstrap.Modal(document.getElementById('modalObligaciones')).show();
    cargarObligaciones();
}

async function cargarObligaciones() {
    try {
        const res = await fetch(`${API_URL}/obligaciones?t=${Date.now()}`);
        const r = await res.json();
        const badge = document.getElementById('badgeDeudasCount');
        if (badge) {
            const count = r.data ? r.data.length : 0;
            badge.innerText = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
        const lista = document.getElementById('listaObligaciones');
        if(lista && r.data) {
            let html = '';
            const verTodos = document.getElementById('chkVerTodos') ? document.getElementById('chkVerTodos').checked : false;
            let mostrados = {};
            r.data.sort((a,b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento)).forEach(i => {
                const dias = parseInt(i.dias_restantes);
                if (!verTodos && i.compromiso_id && dias >= 0) {
                    if (mostrados[i.compromiso_id]) return;
                    mostrados[i.compromiso_id] = true;
                }
                let border = 'border-success', txt = `${dias} días`;
                if(dias < 3 || i.prioridad === 'URGENTE') { border = 'border-danger'; txt = `Vence en ${dias}`; }
                else if(dias < 7) { border = 'border-warning'; }
                if(dias < 0) { border = 'border-danger'; txt = 'VENCIDO'; }
                const fecha = new Date(new Date(i.fecha_vencimiento).getTime() + (5*3600000)).toLocaleDateString('es-PE');
                html += `
                <div class="list-group-item bg-dark text-white p-3 mb-2 shadow-sm border-start border-4 ${border}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <span class="badge bg-secondary mb-1">${txt}</span>
                            <h6 class="mb-0 fw-bold">${i.titulo}</h6>
                            <small class="text-info">${fecha}</small>
                        </div>
                        <div class="text-end">
                            <div class="fs-5 fw-bold mb-1">S/ ${parseFloat(i.monto).toFixed(2)}</div>
                            <button class="btn btn-sm btn-outline-light" onclick="pagarDeuda(${i.id}, ${i.monto}, '${i.titulo}')">PAGAR</button>
                        </div>
                    </div>
                </div>`;
            });
            lista.innerHTML = html || '<div class="text-center p-4 text-muted">¡Todo pagado! 🎉</div>';
        }
    } catch(e) { console.error(e); }
}

async function crearObligacion() {
    const t = document.getElementById('nuevaObliTitulo').value;
    const m = document.getElementById('nuevaObliMonto').value;
    const f = document.getElementById('nuevaObliFecha').value;
    const p = document.getElementById('nuevaObliPrioridad').value;
    if(!t || !m || !f) return notificar("Datos incompletos", "error");
    await fetch(`${API_URL}/obligaciones`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ titulo: t, monto: m, fecha: f, prioridad: p })
    });
    notificar("✅ Recordatorio guardado", "success");
    cargarObligaciones();
    document.getElementById('nuevaObliTitulo').value = '';
    document.getElementById('nuevaObliMonto').value = '';
}

async function pagarDeuda(id, monto, titulo) {
    const origen = prompt(`Pagando: ${titulo} (S/ ${monto})\nOrigen:\n1: Efectivo\n2: Yape\n5: Warda Deuda`);
    if(origen) {
        const res = await fetch(`${API_URL}/obligaciones/pagar`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id_obligacion: id, id_cuenta_origen: origen, monto })
        });
        if((await res.json()).success) {
            notificar("✅ Deuda pagada", "success");
            cargarObligaciones();
            if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
        } else notificar("Error al pagar", "error");
    }
}

async function abrirGestionCuentas() {
    new bootstrap.Modal(document.getElementById('modalGestionCuentas')).show();
    cargarListaCuentasAdmin();
}

async function cargarListaCuentasAdmin() {
    const res = await fetch(`${API_URL}/cuentas/listar`);
    const r = await res.json();
    const lista = document.getElementById('listaCuentasAdmin');
    if(lista && r.success) {
        let html = '';
        r.data.forEach(c => {
            const op = c.activo ? 1 : 0.5;
            const eye = c.activo ? 'fa-eye text-success' : 'fa-eye-slash text-muted';
            html += `
            <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center py-2" style="opacity:${op}">
                <div class="d-flex align-items-center">
                    <button class="btn btn-link text-decoration-none me-3 p-0" onclick="toggleEstadoCuenta(${c.id}, ${c.activo})"><i class="fas ${eye}"></i></button>
                    <input type="text" value="${c.nombre}" class="form-control form-control-sm bg-transparent border-0 text-white fw-bold" onchange="guardarCuenta(${c.id}, this.value)">
                </div>
                <span class="badge bg-secondary rounded-pill">${c.tipo}</span>
            </div>`;
        });
        lista.innerHTML = html;
    }
}

async function toggleEstadoCuenta(id, estado) {
    await fetch(`${API_URL}/cuentas/estado`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, activo: estado ? 0 : 1 })
    });
    cargarListaCuentasAdmin();
}

async function guardarCuenta(id, nombre) {
    const val = nombre || document.getElementById('newNombreCuenta').value;
    const tipo = document.getElementById('newTipoCuenta') ? document.getElementById('newTipoCuenta').value : null;
    if(!val) return;
    await fetch(`${API_URL}/cuentas/guardar`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(id ? { id, nombre: val } : { nombre: val, tipo })
    });
    if(!id) { 
        notificar("✅ Cuenta creada", "success"); 
        document.getElementById('newNombreCuenta').value = '';
        cargarListaCuentasAdmin();
    } else {
        notificar("✅ Nombre actualizado", "success");
    }
}

function toggleTipoCompromiso() {
    const esServ = document.getElementById('tipoServicio').checked;
    const inp = document.getElementById('presCuotas');
    if (esServ) { inp.value = 12; inp.disabled = true; inp.placeholder = "12 Meses"; } 
    else { inp.value = ''; inp.disabled = false; inp.placeholder = "N° Cuotas"; }
}

async function crearPrestamo() {
    const tit = document.getElementById('presTitulo').value, m = document.getElementById('presMonto').value, c = document.getElementById('presCuotas').value, d = document.getElementById('presDia').value;
    const tipo = document.getElementById('tipoServicio').checked ? 'SERVICIO_FIJO' : 'PRESTAMO';
    if(!tit || !m) return notificar("Datos incompletos", "error");
    await fetch(`${API_URL}/compromisos`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ titulo: tit, tipo, monto_total: m*c, monto_cuota: m, cuotas_totales: c, dia_pago: d, warda_origen_id: null })
    });
    notificar("✅ Contrato generado", "success");
    cargarObligaciones();
    document.getElementById('presTitulo').value = '';
}

async function abrirModalContratos() {
    bootstrap.Modal.getInstance(document.getElementById('modalObligaciones')).hide();
    new bootstrap.Modal(document.getElementById('modalContratos')).show();
    const res = await fetch(`${API_URL}/compromisos`);
    const r = await res.json();
    const lista = document.getElementById('listaContratos');
    if(r.success && lista) {
        let html = '';
        r.data.forEach(c => {
            html += `<div class="list-group-item bg-dark text-white d-flex justify-content-between">
                <div><div class="fw-bold text-warning">${c.titulo}</div><small class="text-muted">S/ ${parseFloat(c.monto_cuota_aprox).toFixed(2)}</small></div>
                <button class="btn btn-sm btn-outline-danger" onclick="darBajaContrato(${c.id})">Cancelar</button>
            </div>`;
        });
        lista.innerHTML = html || '<div class="p-3 text-center">Sin contratos</div>';
    }
}

async function darBajaContrato(id) {
    if(confirm("¿Cancelar contrato?")) {
        await fetch(`${API_URL}/compromisos/cancelar`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) });
        abrirModalContratos(); 
        cargarObligaciones();
    }
}