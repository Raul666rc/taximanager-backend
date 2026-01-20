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
// 1. ABRIR EL MODAL (Usando Input Oculto)
function abrirModalMeta(id, nom, monto) {
    console.log("📝 Editando ID:", id);

    // PASO CLAVE: Usamos el input oculto que ya existe en tu HTML
    const inputId = document.getElementById('hdnCuentaIdMeta');
    
    if (inputId) {
        inputId.value = id; // Guardamos el ID aquí
    } else {
        console.error("❌ No encuentro el input 'hdnCuentaIdMeta' en el HTML");
        return;
    }

    document.getElementById('lblNombreCuentaMeta').innerText = nom;
    document.getElementById('inputNuevaMeta').value = parseFloat(monto).toFixed(2);
    
    // Mostramos el modal
    new bootstrap.Modal(document.getElementById('modalEditarMeta')).show();
    setTimeout(() => document.getElementById('inputNuevaMeta').select(), 500);
}

// 2. GUARDAR (Leyendo del Input Oculto)
async function guardarMetaEditada() {
    // RECUPERAR DATOS DEL INPUT OCULTO
    const idInput = document.getElementById('hdnCuentaIdMeta');
    const id = idInput ? idInput.value : null;
    const montoStr = document.getElementById('inputNuevaMeta').value;

    console.log("💾 Intentando guardar -> ID:", id, "Monto:", montoStr);

    // Validaciones
    if (!id) return notificar("Error: ID de cuenta perdido. Recarga la página.", "error");
    if (!montoStr) return notificar("Ingresa un monto válido", "error");

    const btn = document.querySelector('#modalEditarMeta button.btn-info');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const payload = {
            cuenta_id: parseInt(id),      // Convertimos a Entero
            nuevo_monto: parseFloat(montoStr) // Convertimos a Decimal
        };

        const res = await fetch(`${API_URL}/finanzas/metas/editar`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();

        if (data.success) {
            notificar("✅ Meta actualizada", "success");
            
            // Cerrar y Limpiar
            bootstrap.Modal.getInstance(document.getElementById('modalEditarMeta')).hide();
            await cargarControlMetas(); 
            
            if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
        } else {
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
        // 1. FETCH CON TIMESTAMP (Para evitar caché)
        const res = await fetch(`${API_URL}/obligaciones?t=${Date.now()}`);
        const r = await res.json();
        
        // ==========================================
        // 2. RECUPERANDO EL BADGE (NOTIFICADOR) 🔴
        // ==========================================
        const badge = document.getElementById('badgeDeudasCount');
        if (badge) {
            // Contamos solo las pendientes reales para el badge
            const count = r.data ? r.data.length : 0;
            badge.innerText = count;
            // Si hay deudas, mostramos el badge rojo, si no, lo ocultamos
            badge.style.display = count > 0 ? 'inline-block' : 'none';
            
            // Animación visual si hay deudas nuevas
            if(count > 0) badge.classList.add('animate__animated', 'animate__pulse');
        }

        const lista = document.getElementById('listaObligaciones');
        if(!lista) return;

        if (r.data && r.data.length > 0) {
            let html = '';
            
            // 3. RECUPERANDO EL FILTRO "VER FUTUROS" 🕵️‍♂️
            const verTodos = document.getElementById('chkVerTodos') ? document.getElementById('chkVerTodos').checked : false;
            let mostrados = {}; // Para controlar duplicados de contratos futuros

            // Ordenamos por fecha (Lo más urgente primero)
            r.data.sort((a,b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));

            r.data.forEach(o => {
                // Cálculo de días (Lógica Antigua Recuperada)
                const dias = parseInt(o.dias_restantes);

                // LÓGICA DE FILTRO: 
                // Si es un contrato (tiene compromiso_id) y falta mucho (dias >= 0),
                // solo mostramos el PRIMERO que aparezca (el más cercano) y ocultamos los siguientes
                // a menos que el check 'verTodos' esté activado.
                if (!verTodos && o.compromiso_id && dias >= 0) {
                     if (mostrados[o.compromiso_id]) return; // Si ya mostré la cuota de este mes, salto las siguientes
                     mostrados[o.compromiso_id] = true;
                }

                // 4. LÓGICA DE COLORES Y TEXTOS (DISEÑO NUEVO + LÓGICA ANTIGUA) 🎨
                let borderClass = 'border-secondary';
                let icon = 'fa-calendar-check text-secondary'; 
                let colorText = 'text-white';
                let estadoTexto = `${dias} días`;

                // URGENTE O VENCIDO
                if (dias < 0) { 
                    borderClass = 'border-danger border-2'; 
                    icon = 'fa-exclamation-triangle text-danger animate__animated animate__flash animate__slow animate__infinite'; 
                    estadoTexto = 'VENCIDO';
                    colorText = 'text-danger fw-bold';
                }
                else if (dias <= 3 || o.prioridad === 'URGENTE') { 
                    borderClass = 'border-danger'; 
                    icon = 'fa-clock text-danger'; 
                    estadoTexto = `Vence en ${dias} días`;
                }
                // PRÓXIMO (ALERTA AMARILLA)
                else if (dias <= 7) { 
                    borderClass = 'border-warning'; 
                    icon = 'fa-bell text-warning'; 
                }

                // Ajuste de fecha (Zona Horaria PE)
                const fechaObj = new Date(new Date(o.fecha_vencimiento).getTime() + (5*3600000));
                const fechaStr = fechaObj.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });

                // 5. RENDERIZADO (EL HTML PREMIUM QUE YA TE GUSTABA)
                html += `
                <div class="list-group-item bg-black text-white d-flex justify-content-between align-items-center mb-2 rounded border-start border-4 shadow-sm ${borderClass}">
                    <div class="d-flex align-items-center">
                        <div class="me-3 text-center" style="width: 30px;">
                            <i class="fas ${icon} fs-5"></i>
                        </div>
                        <div>
                            <div class="fw-bold ${colorText}">${o.titulo}</div>
                            <div class="d-flex align-items-center gap-2">
                                <small class="text-white-50"><i class="far fa-calendar-alt me-1"></i>${fechaStr}</small>
                                <span class="badge bg-secondary bg-opacity-25 text-white border border-secondary" style="font-size: 0.65rem;">${estadoTexto}</span>
                            </div>
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="fw-bold text-info fs-5">S/ ${parseFloat(o.monto).toFixed(2)}</div>
                        <button class="btn btn-sm btn-outline-success mt-1 fw-bold" onclick="abrirModalPago(${o.id}, '${o.titulo}', ${o.monto})">
                            PAGAR <i class="fas fa-chevron-right ms-1"></i>
                        </button>
                    </div>
                </div>`;
            });

            lista.innerHTML = html;
        } else {
            lista.innerHTML = '<div class="text-center p-5 text-muted"><i class="fas fa-check-circle fa-3x mb-3 text-success opacity-50"></i><br>¡Estás al día! 🎉</div>';
        }
    } catch (e) { console.error(e); }
}

async function crearObligacion() {
    // Capturamos datos del HTML nuevo (Sección Verde)
    const t = document.getElementById('nuevaObliTitulo').value;
    const m = document.getElementById('nuevaObliMonto').value;
    const f = document.getElementById('nuevaObliFecha').value;
    const p = document.getElementById('nuevaObliPrioridad').value;

    if(!t || !m || !f) return notificar("Completa los datos del gasto", "error");

    const btn = document.querySelector('button[onclick="crearObligacion()"]');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const res = await fetch(`${API_URL}/obligaciones`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ titulo: t, monto: m, fecha_vencimiento: f, prioridad: p })
        });

        if((await res.json()).success) {
            notificar("✅ Recordatorio guardado", "success");
            
            // LIMPIEZA DE CAMPOS (Esencial)
            document.getElementById('nuevaObliTitulo').value = '';
            document.getElementById('nuevaObliMonto').value = '';
            document.getElementById('nuevaObliFecha').value = '';
            
            // Recargamos la lista y el badge
            cargarObligaciones(); 
        }
    } catch(e) { 
        notificar("Error conexión", "error"); 
    } finally {
        btn.disabled = false; btn.innerHTML = txtOriginal;
    }
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

// ==========================================
// LÓGICA DE CONTRATOS (MEJORADA)
// ==========================================

// 1. CAMBIAR ENTRE PRÉSTAMO Y SERVICIO
function toggleTipoCompromiso() {
    const esServicio = document.getElementById('tipoServicio').checked;
    const inputCuotas = document.getElementById('presCuotas');
    
    if (esServicio) {
        inputCuotas.value = '';        // Servicios son indefinidos (usualmente)
        inputCuotas.disabled = true;   // Bloqueamos cuotas
        inputCuotas.placeholder = "∞"; // Símbolo de infinito
        inputCuotas.classList.add('opacity-50');
    } else {
        inputCuotas.value = '';
        inputCuotas.disabled = false;  // Habilitamos cuotas
        inputCuotas.placeholder = "Total";
        inputCuotas.classList.remove('opacity-50');
    }
}

// 2. CREAR Y LIMPIAR
async function crearPrestamo() {
    // Captura de datos
    const tit = document.getElementById('presTitulo').value;
    const m = document.getElementById('presMonto').value;
    const c = document.getElementById('presCuotas').value;
    const d = document.getElementById('presDia').value;
    
    // Validaciones
    if(!tit || !m || !d) {
        return notificar("Falta Nombre, Monto o Día", "error");
    }

    const esServicio = document.getElementById('tipoServicio').checked;
    
    // Si es Préstamo, exigimos cuotas. Si es Servicio, no.
    if (!esServicio && !c) {
        return notificar("Indica el número de cuotas del préstamo", "error");
    }

    // Bloqueo botón
    const btn = document.querySelector('button[onclick="crearPrestamo()"]');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';

    try {
        const payload = { 
            titulo: tit, 
            tipo: esServicio ? 'SERVICIO_FIJO' : 'PRESTAMO', 
            monto_total: esServicio ? null : (parseFloat(m) * parseInt(c)), // Solo calculamos total si es préstamo
            monto_cuota: parseFloat(m), 
            cuotas_totales: esServicio ? null : parseInt(c), 
            dia_pago: parseInt(d), 
            warda_origen_id: null 
        };

        const res = await fetch(`${API_URL}/compromisos`, {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            notificar("✅ Contrato generado exitosamente", "success");
            
            // 🧹 LIMPIEZA AUTOMÁTICA DE CAMPOS
            document.getElementById('presTitulo').value = '';
            document.getElementById('presMonto').value = '';
            document.getElementById('presCuotas').value = '';
            document.getElementById('presDia').value = '';
            
            // Resetear a Préstamo por defecto
            document.getElementById('tipoPrestamo').checked = true;
            toggleTipoCompromiso(); // Para rehabilitar el input de cuotas visualmente

            // Recargar lista
            cargarObligaciones();
        } else {
            notificar("Error: " + data.message, "error");
        }
    } catch (e) {
        console.error(e);
        notificar("Error de conexión", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = txtOriginal;
    }
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
                <button class="btn btn-sm btn-outline-danger" onclick="confirmarCancelacion(${c.id})">Cancelar</button>
            </div>`;
        });
        lista.innerHTML = html || '<div class="p-3 text-center">Sin contratos</div>';
    }
}

// ==========================================
// NUEVA LÓGICA DE ELIMINACIÓN (PREMIUM & ANTI-CONGELAMIENTO)
// ==========================================

// 1. PREGUNTAR (Abre el modal rojo bonito)
function confirmarCancelacion(id) {
    // Guardamos el ID en el input oculto
    const inputId = document.getElementById('hdnIdEliminar');
    if (inputId) inputId.value = id;

    // A. Cerramos el modal de lista actual para evitar conflictos visuales
    const modalLista = bootstrap.Modal.getInstance(document.getElementById('modalContratos'));
    if (modalLista) modalLista.hide();

    // B. Abrimos el modal de confirmación
    const modalConfirm = new bootstrap.Modal(document.getElementById('modalConfirmarEliminar'));
    modalConfirm.show();
}

// 2. EJECUTAR (Hace el borrado real)
async function ejecutarEliminacion() {
    const id = document.getElementById('hdnIdEliminar').value;
    if (!id) return;

    // Efecto de carga en el botón
    const btn = document.querySelector('#modalConfirmarEliminar .btn-danger');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Borrando...';

    try {
        const res = await fetch(`${API_URL}/compromisos/cancelar`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: id })
        });
        
        const data = await res.json();

        if (data.success) {
            // CERRAR EL MODAL DE CONFIRMACIÓN
            const modalConfirm = bootstrap.Modal.getInstance(document.getElementById('modalConfirmarEliminar'));
            modalConfirm.hide();

            // ============================================================
            // 🛑 LIMPIEZA NUCLEAR (SOLUCIÓN AL CONGELAMIENTO)
            // ============================================================
            // Forzamos la eliminación de cualquier fondo gris que haya quedado pegado
            setTimeout(() => {
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.overflow = 'auto'; 
                document.body.style.paddingRight = '0';
            }, 300); // Pequeño retraso para asegurar que Bootstrap terminó su animación

            notificar("🗑️ Contrato eliminado correctamente", "success");
            
            // Recargamos las obligaciones en la pantalla principal
            if(typeof cargarObligaciones === 'function') cargarObligaciones();

            // NOTA: No reabrimos la lista de contratos automáticamente para evitar 
            // que se crucen las animaciones. Es más seguro volver al Dashboard.

        } else {
            notificar("Error: " + data.message, "error");
        }
    } catch (e) {
        console.error(e);
        notificar("Error de conexión", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = txtOriginal;
    }
}