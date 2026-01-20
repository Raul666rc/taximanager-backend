// ==========================================
// MÓDULO: FINANZAS Y CONTROL DE DINERO
// ==========================================

// Variables Globales del Módulo (Cierre de Caja)
let sysEfe = 0, sysYape = 0, ingresosHoyBD = 0, gastosHoyBD = 0, difEfe = 0, difYape = 0;

// 1. CARGAR META DIARIA (DASHBOARD) - CORREGIDO PARA EFECTO NEÓN
async function cargarMetaDiaria() {
    try {
        const response = await fetch(`${API_URL}/resumen`);
        const result = await response.json();

        if (result.success) {
            const total = parseFloat(result.total) || 0;
            const meta = parseFloat(result.meta) || 200;

            // Elementos del DOM
            const elTotal = document.getElementById('lblTotalDia');
            const barra = document.getElementById('barraMeta');
            const elPorc = document.getElementById('lblPorcentaje');
            const lblFrase = document.getElementById('lblFrase');
            const elMetaNum = document.getElementById('lblMetaNum');

            if (!elTotal || !barra) return; 

            // Renderizado Texto
            elTotal.innerText = total.toFixed(2);
            elMetaNum.innerText = `Meta: S/ ${meta.toFixed(0)}`;

            let porcentaje = (total / meta) * 100;
            if (porcentaje > 100) porcentaje = 100;
            
            // Renderizado Barra
            barra.style.width = `${porcentaje}%`;
            elPorc.innerText = `${(total/meta*100).toFixed(0)}%`;
            
            // --- AQUÍ ESTABA EL ERROR ---
            // Antes borraba 'progress-bar-neon'. Ahora lo mantenemos como base.
            barra.className = 'progress-bar-neon'; // Clase base del CSS Premium
            
            // Limpiamos colores previos
            barra.classList.remove('bg-danger', 'bg-warning', 'bg-info', 'bg-primary', 'bg-success');
            
            // Lógica de Semáforo (Neón)
            if (porcentaje < 15) { 
                barra.classList.add('bg-danger'); // Rojo Neón
                if(lblFrase) { lblFrase.innerText = "¡Arrancamos! 🚦"; lblFrase.className = "text-muted small fst-italic"; } 
            } 
            else if (porcentaje < 40) { 
                barra.classList.add('bg-warning'); // Amarillo Neón
                if(lblFrase) { lblFrase.innerText = "¡Buen ritmo! 🚕"; lblFrase.className = "text-white small fw-bold"; } 
            } 
            else if (porcentaje < 75) { 
                barra.classList.add('bg-info'); // Cian Neón
                if(lblFrase) { lblFrase.innerText = "¡Vamos bien! 💪"; lblFrase.className = "text-info small fw-bold"; } 
            } 
            else if (porcentaje < 100) { 
                barra.classList.add('bg-primary'); // Morado Neón
                if(lblFrase) { lblFrase.innerText = "¡Ya casi! 🔥"; lblFrase.className = "text-warning small fw-bold"; } 
            } 
            else { 
                barra.classList.add('bg-success'); // Verde Neón
                if(lblFrase) { lblFrase.innerText = "¡META CUMPLIDA! 🏆"; lblFrase.className = "text-success small fw-bold text-uppercase"; } 
            }
        }
    } catch (e) { console.error("Error cargando meta:", e); }
}

// 2. GESTIÓN DE META (MODAL)
function cambiarMeta() {
    const textoActual = document.getElementById('lblMetaNum').innerText.replace('Meta: S/ ', '');
    document.getElementById('inputMetaDiaria').value = parseFloat(textoActual) || 200;
    const modal = new bootstrap.Modal(document.getElementById('modalMetaDiaria'));
    modal.show();
    setTimeout(() => document.getElementById('inputMetaDiaria').select(), 500);
}

function setMetaRapida(valor) {
    document.getElementById('inputMetaDiaria').value = valor;
    guardarNuevaMeta(); 
}

async function guardarNuevaMeta() {
    const nuevaMeta = document.getElementById('inputMetaDiaria').value;
    if (nuevaMeta && !isNaN(nuevaMeta) && nuevaMeta > 0) {
        const btn = document.querySelector('button[onclick="guardarNuevaMeta()"]');
        const txt = btn.innerHTML; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
        btn.disabled = true;
        
        try {
            const res = await fetch(`${API_URL}/meta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meta: nuevaMeta }) });
            if ((await res.json()).success) {
                bootstrap.Modal.getInstance(document.getElementById('modalMetaDiaria')).hide();
                cargarMetaDiaria();
                notificar(`🎯 Meta actualizada a S/ ${nuevaMeta}`, "exito");
            }
        } catch (e) { notificar("Error conexión", "error"); } 
        finally { btn.innerHTML = txt; btn.disabled = false; }
    }
}

// ==========================================
// 3. GASTOS (REGULAR Y RÁPIDO)
// ==========================================

// A. GASTO DETALLADO (MODAL GRANDE)
// ABRIR MODAL DETALLADO (Pégalo junto a guardarGasto)
function abrirModalGasto() {
    // 1. Limpiar campos
    document.getElementById('montoGasto').value = '';
    document.getElementById('descGasto').value = '';
    
    // 2. Resetear selección (Combustible por defecto)
    if(document.getElementById('catCombustible')) {
        document.getElementById('catCombustible').checked = true;
    }

    // 3. Abrir modal
    const modalEl = document.getElementById('modalGasto');
    new bootstrap.Modal(modalEl).show();
    
    // 4. Foco
    setTimeout(() => document.getElementById('montoGasto').focus(), 500);
}
async function guardarGasto() {
    const monto = document.getElementById('montoGasto').value;
    let descripcion = document.getElementById('descGasto').value;
    const cuentaId = document.getElementById('cuentaGasto').value;
    
    // Obtenemos la categoría marcada
    const categoria = document.querySelector('input[name="catGasto"]:checked').value;

    if (!monto) return notificar("Ingresa el monto", "info");
    if (!descripcion) descripcion = categoria; 

    try {
        // Usamos la ruta genérica de transacciones que ya tienes
        const res = await fetch(`${API_URL}/transaccion`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                monto: parseFloat(monto), 
                descripcion, 
                cuenta_id: parseInt(cuentaId), 
                categoria: categoria.toUpperCase(),
                tipo: 'GASTO' // Importante para que el backend sepa que resta
            }) 
        });
        
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('montoGasto').value = ''; 
            document.getElementById('descGasto').value = '';
            
            const modalEl = document.getElementById('modalGasto');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            
            // Actualizar pantallas
            if(typeof cargarBilletera === 'function') cargarBilletera();
            if(typeof cargarMovimientos === 'function') cargarMovimientos();
            if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
            
            notificar(`✅ Gasto de ${categoria} registrado.`, "success");
        } else {
            notificar("Error: " + data.message, "error");
        }
    } catch (e) { 
        console.error(e);
        notificar("Error conexión", "error"); 
    }
}


// B. GASTO RÁPIDO (BOTÓN FLOTANTE - MODO CONDUCCIÓN)

// 1. ABRIR EL MODAL
function abrirModalGastoRapido() {
    // Limpiamos los campos
    document.getElementById('montoGastoRapido').value = '';
    document.getElementById('notaGastoRapido').value = '';
    document.getElementById('catGasolina').checked = true; // Default
    
    // Mostramos el modal
    const modalEl = document.getElementById('modalGastoRapido');
    new bootstrap.Modal(modalEl).show();
    
    // Foco automático
    setTimeout(() => document.getElementById('montoGastoRapido').focus(), 500);
}

// 2. ENVIAR AL SERVIDOR
async function enviarGastoRapido() {
    const monto = parseFloat(document.getElementById('montoGastoRapido').value);
    const notaInput = document.getElementById('notaGastoRapido').value;
    const categoria = document.querySelector('#modalGastoRapido input[name="catGasto"]:checked').value;
    
    if (!monto || monto <= 0) return notificar("Ingresa un monto válido", "error");

    const btn = document.querySelector('#modalGastoRapido button.btn-danger');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        // Payload corregido para tu Controlador
        const payload = {
            monto: monto,
            categoria: categoria.toUpperCase(),
            nota: notaInput || `Gasto Rápido: ${categoria}`, // Usamos 'nota' porque tu Controller lo espera así
            cuenta_id: 1 // SIEMPRE EFECTIVO (ID 1)
        };

        const res = await fetch(`${API_URL}/finanzas/gasto-rapido`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(payload) 
        });
        
        const data = await res.json();

        if (data.success) {
            notificar(`✅ Gasto de S/ ${monto} registrado`, "success");
            
            bootstrap.Modal.getInstance(document.getElementById('modalGastoRapido')).hide();
            
            // Recargar datos
            if(typeof cargarBilletera === 'function') cargarBilletera();
            if(typeof cargarMovimientos === 'function') cargarMovimientos();
            if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();
        } else {
            notificar("Error: " + data.message, "error");
        }
    } catch (e) { 
        console.error(e);
        notificar("Error conexión", "error"); 
    } finally { 
        btn.innerHTML = txtOriginal; 
        btn.disabled = false; 
    }
}

// 4. BILLETERA (DASHBOARD COMPLETO)
async function abrirBilletera(periodo = 'mes') {
    try {
        const res = await fetch(`${API_URL}/billetera?periodo=${periodo}`);
        const result = await res.json();
        
        if (result.success) {
            const data = result.data; 
            const cuentas = data.cuentas;
            const findSaldo = (id) => cuentas.find(c => c.id === id)?.saldo_actual || 0;

            // Render Saldos
            document.getElementById('txtEfectivo').innerText = `S/ ${parseFloat(findSaldo(1)).toFixed(2)}`;
            document.getElementById('txtYape').innerText = `S/ ${parseFloat(findSaldo(2)).toFixed(2)}`;
            document.getElementById('txtAhorro').innerText = `S/ ${parseFloat(findSaldo(3)).toFixed(2)}`;
            document.getElementById('txtWardaTaller').innerText = `S/ ${parseFloat(findSaldo(4)).toFixed(2)}`;
            document.getElementById('txtWardaDeuda').innerText = `S/ ${parseFloat(findSaldo(5)).toFixed(2)}`;
            document.getElementById('txtWardaEmergencia').innerText = `S/ ${parseFloat(findSaldo(6)).toFixed(2)}`;
            
            const txtGastos = document.getElementById('txtGastos');
            if(txtGastos) txtGastos.innerText = `S/ ${parseFloat(data.gasto_mensual).toFixed(2)}`;

            // Render Lista Movimientos (Dentro del Modal)
            const divMovs = document.getElementById('listaMovimientos');
            if (divMovs && data.movimientos) {
                let html = '';
                data.movimientos.forEach(m => {
                    let i = 'fa-circle', c = 'text-white', s = '';
                    
                    if (m.tipo === 'INGRESO') { i = 'fa-arrow-up'; c = 'text-success'; s = '+'; }
                    else if (m.tipo === 'GASTO') { i = 'fa-arrow-down'; c = 'text-danger'; s = '-'; }
                    else if (m.tipo === 'PAGO_DEUDA') { i = 'fa-check-double'; c = 'text-info'; s = '-'; }
                    else if (m.tipo === 'TRANSFERENCIA') { i = 'fa-exchange-alt'; c = 'text-warning'; s = ' '; }
                    
                    html += `
                    <div class="d-flex justify-content-between align-items-center border-bottom border-secondary py-2">
                        <div class="d-flex align-items-center">
                            <div class="me-3 ${c}"><i class="fas ${i}"></i></div>
                            <div>
                                <div class="small fw-bold text-white">${m.descripcion}</div>
                                <div class="text-muted" style="font-size: 0.7rem;">${m.fecha_fmt}</div>
                            </div>
                        </div>
                        <div class="fw-bold ${c}">${s} S/ ${parseFloat(m.monto).toFixed(2)}</div>
                    </div>`;
                });
                divMovs.innerHTML = html || '<div class="text-center text-muted small py-3">Sin movimientos</div>';
            }
            
            // Llamada a Gráficos (Si el módulo grafico.js está cargado)
            if(typeof dibujarDona === 'function') dibujarDona(data.estadisticas);
            if(typeof dibujarBarras === 'function') dibujarBarras(data.semana);
            
            const modalEl = document.getElementById('modalBilletera');
            if (!modalEl.classList.contains('show')) new bootstrap.Modal(modalEl).show();
        }
    } catch (e) { console.error(e); }
}

async function cargarMovimientos() {
    const contenedor = document.getElementById('listaMovimientosHome');
    if (!contenedor) return;
    try {
        const res = await fetch(`${API_URL}/finanzas/movimientos`);
        const result = await res.json();
        
        if (result.success) {
            if (result.data.length === 0) { 
                contenedor.innerHTML = '<div class="text-center py-3 text-muted">No hay movimientos aún.</div>'; 
                return; 
            }
            
            let html = '';
            result.data.forEach(m => {
                let i = 'fa-arrow-down', cI = 'bg-danger', cT = 'text-danger', s = '-';
                
                if (m.tipo === 'INGRESO') { i = 'fa-arrow-up'; cI = 'bg-success'; cT = 'text-success'; s = '+'; }
                if (m.categoria && m.categoria.includes('Transferencia')) { i = 'fa-right-left'; cI = 'bg-info'; cT = 'text-info'; s = ''; }
                
                const fecha = new Date(m.fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
                const hora = new Date(m.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                
                html += `
                <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center px-3 py-2">
                    <div class="d-flex align-items-center">
                        <div class="rounded-circle ${cI} d-flex align-items-center justify-content-center me-3 shadow-sm" style="width: 35px; height: 35px;">
                            <i class="fa-solid ${i} text-white small"></i>
                        </div>
                        <div style="line-height: 1.2;">
                            <div class="text-white fw-bold small text-uppercase mb-0 text-truncate" style="max-width: 180px;">${m.descripcion}</div>
                            <small class="text-muted" style="font-size: 0.7rem;">${fecha} • ${hora} | <span class="text-secondary">${m.nombre_cuenta || 'General'}</span></small>
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="${cT} fw-bold" style="font-size: 0.95rem;">${s} S/ ${parseFloat(m.monto).toFixed(2)}</div>
                    </div>
                </div>`;
            });
            contenedor.innerHTML = html;
        }
    } catch (e) { contenedor.innerHTML = '<div class="text-center py-3 text-danger">Error datos.</div>'; }
}

// 5. TRANSFERENCIAS
async function abrirModalTransferencia(datosReparto = null) {
    // Cerrar otros modales que estorben
    const mb = bootstrap.Modal.getInstance(document.getElementById('modalBilletera')); if (mb) mb.hide();
    const mc = bootstrap.Modal.getInstance(document.getElementById('modalCierreCaja')); if (mc) mc.hide();

    // Configurar Panel de Recordatorio (Chuleta)
    const panelRec = document.getElementById('divRecordatorioReparto');
    if (datosReparto) {
        panelRec.classList.remove('d-none');
        document.getElementById('recSueldo').innerText = datosReparto.sueldo;
        document.getElementById('recArca').innerText = datosReparto.arca;
        document.getElementById('recDeuda').innerText = datosReparto.deuda;
        document.getElementById('recTaller').innerText = datosReparto.taller;
    } else {
        panelRec.classList.add('d-none');
        document.getElementById('montoTransferencia').value = '';
    }

    const sO = document.getElementById('selectOrigen'), sD = document.getElementById('selectDestino'), lbl = document.getElementById('lblSaldoDisponible');
    sO.innerHTML = '<option>Cargando...</option>'; sD.innerHTML = '<option>Cargando...</option>'; lbl.innerText = "...";
    
    new bootstrap.Modal(document.getElementById('modalTransferencia')).show();

    try {
        const res = await fetch(`${API_URL}/finanzas/cuentas`);
        const result = await res.json();
        
        if (result.success) {
            let html = ''; 
            result.data.forEach(c => html += `<option value="${c.id}">${c.nombre}</option>`);
            
            sO.innerHTML = html; 
            sD.innerHTML = html;
            
            // Cachear Saldos
            saldosCache = {}; 
            result.data.forEach(c => saldosCache[c.id] = parseFloat(c.saldo_actual));
            
            // Selección Inteligente (Lógica mantenida)
            if (datosReparto) { 
                if(saldosCache[1]) sO.value = 1; // Efectivo
                if(saldosCache[6]) sD.value = 6; // Warda Emergencia (o lo que definieras como destino por defecto)
            } else { 
                if(saldosCache[1]) sO.value = 1; // Efectivo
                if(saldosCache[3]) sD.value = 3; // Arca
            }
            actualizarSaldoOrigen();
        } else lbl.innerText = "Error";
    } catch (e) { lbl.innerText = "Sin conexión"; }
}

function actualizarSaldoOrigen() {
    const id = document.getElementById('selectOrigen').value;
    const lbl = document.getElementById('lblSaldoDisponible');
    
    if (saldosCache && saldosCache[id] !== undefined) {
        const s = saldosCache[id];
        lbl.innerText = `S/ ${s.toFixed(2)}`;
        lbl.className = s < 10 ? "fw-bold text-danger" : "fw-bold text-success";
    } else lbl.innerText = "--";
}

// ==========================================
// REALIZAR TRANSFERENCIA (MODO CONTINUO)
// ==========================================
async function realizarTransferencia() {
    const oId = document.getElementById('selectOrigen').value;
    const dId = document.getElementById('selectDestino').value;
    const monto = parseFloat(document.getElementById('montoTransferencia').value);
    const nota = document.getElementById('notaTransferencia').value || 'Transferencia App';

    if (!monto || monto <= 0) return notificar("Ingresa un monto válido", "error");
    if (oId === dId) return notificar("Origen y destino iguales", "error");
    
    // Validación de saldo (usando caché actualizado)
    if (saldosCache[oId] !== undefined && monto > saldosCache[oId]) {
        return notificar("Saldo insuficiente", "error");
    }

    const btn = document.querySelector('button[onclick="realizarTransferencia()"]');
    const txt = btn.innerHTML; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/transferir`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ cuenta_origen_id: oId, cuenta_destino_id: dId, monto, nota }) 
        });
        const data = await res.json();
        
        if (data.success) {
            notificar("✅ Transferencia exitosa", "success");
            
            // ACTUALIZAR SALDOS EN MEMORIA (IMPORTANTE PARA LA SIGUIENTE TRANSFERENCIA)
            // Restamos del origen y sumamos al destino en el caché local
            if(saldosCache[oId]) saldosCache[oId] -= monto;
            if(saldosCache[dId]) saldosCache[dId] += monto;
            
            // Actualizamos visualmente el saldo disponible del origen
            actualizarSaldoOrigen();

            // LIMPIEZA PARCIAL
            document.getElementById('montoTransferencia').value = ''; 
            
            // LÓGICA DE CIERRE INTELIGENTE 🧠
            // Verificamos si el panel de recordatorio está visible
            const panelRec = document.getElementById('divRecordatorioReparto');
            const esModoReparto = !panelRec.classList.contains('d-none');

            if (esModoReparto) {
                // MODO REPARTO: NO cerramos el modal.
                // Ponemos foco en monto para seguir transfiriendo rápido
                notificar("💰 Puedes seguir repartiendo...", "info");
                setTimeout(() => document.getElementById('montoTransferencia').focus(), 500);
            } else {
                // MODO NORMAL: Cerramos el modal
                bootstrap.Modal.getInstance(document.getElementById('modalTransferencia')).hide();
                document.getElementById('notaTransferencia').value = ''; // Limpiamos nota solo al cerrar
            }
            
            // Actualizamos fondo (Metas, etc.)
            if(typeof cargarMetaDiaria === 'function') cargarMetaDiaria();

        } else {
            notificar(data.message, "error");
        }
    } catch (e) { 
        console.error(e);
        notificar("Error conexión", "error"); 
    } finally { 
        btn.innerHTML = txt; 
        btn.disabled = false; 
    }
}

function irATransferirConDatos() {
    const datos = {
        sueldo: document.getElementById('sugPersonal').innerText,
        arca: document.getElementById('sugArca').innerText,
        deuda: document.getElementById('detDeuda').innerText,
        taller: document.getElementById('detTaller').innerText
    };
    abrirModalTransferencia(datos);
}

// 6. CIERRE DE CAJA (LÓGICA MATEMÁTICA VERIFICADA)
async function abrirCierreCaja() {
    document.getElementById('paso1_conteo').classList.remove('d-none');
    document.getElementById('paso2_resultado').classList.add('d-none');
    document.getElementById('paso3_reparto').classList.add('d-none');
    
    document.getElementById('inputRealEfectivo').value = ''; 
    document.getElementById('inputRealYape').value = '';
    
    new bootstrap.Modal(document.getElementById('modalCierreCaja')).show();

    try {
        const res = await fetch(`${API_URL}/finanzas/cierre-datos`);
        const r = await res.json();
        if(r.success) {
            sysEfe = parseFloat(r.saldo_efectivo); 
            sysYape = parseFloat(r.saldo_yape);
            ingresosHoyBD = parseFloat(r.ingresos_hoy) || 0; 
            gastosHoyBD = parseFloat(r.gastos_hoy) || 0;
            
            document.getElementById('lblSysEfectivo').innerText = sysEfe.toFixed(2);
            document.getElementById('lblSysYape').innerText = sysYape.toFixed(2);
        }
    } catch(e) { notificar("Error datos", "error"); }
}

function verificarCierre() {
    const inEfe = document.getElementById('inputRealEfectivo').value;
    const inYape = document.getElementById('inputRealYape').value;
    
    if(inEfe === '' || inYape === '') return notificar("Completa montos", "error");
    
    difEfe = parseFloat(inEfe) - sysEfe; 
    difYape = parseFloat(inYape) - sysYape;
    const difTotal = difEfe + difYape;

    document.getElementById('paso1_conteo').classList.add('d-none');
    document.getElementById('paso2_resultado').classList.remove('d-none');
    
    const ico = document.getElementById('iconoResultado');
    const tit = document.getElementById('tituloResultado');
    const msg = document.getElementById('mensajeResultado');
    
    if (Math.abs(difTotal) < 1) { 
        ico.innerHTML = "✅"; tit.className = "fw-bold mb-2 text-success"; tit.innerText = "¡Caja Cuadrada!"; msg.innerText = "Todo coincide."; 
    }
    else if (difTotal < 0) { 
        ico.innerHTML = "⚠️"; tit.className = "fw-bold mb-2 text-danger"; tit.innerText = "Falta Dinero"; msg.innerText = `Falta S/ ${Math.abs(difTotal).toFixed(2)}`; 
    }
    else { 
        ico.innerHTML = "🤑"; tit.className = "fw-bold mb-2 text-info"; tit.innerText = "Sobra Dinero"; msg.innerText = `Sobran S/ ${difTotal.toFixed(2)}`; 
    }
}

async function procesarAjusteYReparto() {
    // Función auxiliar para evitar crash si falta un elemento visual
    const safeText = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    
    // 1. Guardar ajuste en BD
    if (difEfe !== 0) { try { await fetch(`${API_URL}/finanzas/cierre-ajuste`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ diferencia: difEfe }) }); } catch(e) {} }

    // 2. Cálculos Reales
    const totalEnMano = (parseFloat(document.getElementById('inputRealEfectivo').value)||0) + (parseFloat(document.getElementById('inputRealYape').value)||0);
    
    // Lógica Base Ayer = SaldoTotal - IngresosHoy + GastosHoy
    const saldoSistemaTotal = sysEfe + sysYape + difEfe + difYape; 
    const baseAyer = saldoSistemaTotal - ingresosHoyBD + gastosHoyBD;
    
    // Ganancia Neta
    let gananciaHoy = totalEnMano - baseAyer; 
    if (gananciaHoy < 0) gananciaHoy = 0; 

    // 3. Estrategia de Reparto (10/10/80) - LÓGICA ORIGINAL
    const paraSueldo = gananciaHoy * 0.10; 
    const paraArca = gananciaHoy * 0.10; 
    const paraNegocio = gananciaHoy * 0.80; 

    // Desglose del Negocio
    let remanenteNegocio = paraNegocio - 40.00; // -Comida
    let paraDeuda = remanenteNegocio > 0 ? remanenteNegocio * 0.40 : 0;
    let paraTaller = remanenteNegocio > 0 ? remanenteNegocio * 0.20 : 0;
    let paraGasolina = remanenteNegocio > 0 ? remanenteNegocio * 0.40 : 0;

    // 4. Pintar datos
    safeText('resTotalMano', `S/ ${totalEnMano.toFixed(2)}`); 
    safeText('resBaseAyer', `S/ ${baseAyer.toFixed(2)}`); 
    safeText('resGananciaHoy', `S/ ${gananciaHoy.toFixed(2)}`); 
    safeText('montoFinalReparto', `S/ ${gananciaHoy.toFixed(2)}`);
    
    safeText('sugPersonal', `S/ ${paraSueldo.toFixed(2)}`); 
    safeText('sugArca', `S/ ${paraArca.toFixed(2)}`); 
    safeText('sugNegocioTotal', `S/ ${paraNegocio.toFixed(2)}`);
    
    safeText('detComida', `S/ 40.00`); 
    safeText('detDeuda', `S/ ${paraDeuda.toFixed(2)}`); 
    safeText('detTaller', `S/ ${paraTaller.toFixed(2)}`); 
    safeText('detGasolina', `S/ ${paraGasolina.toFixed(2)}`);
    
    safeText('saldoRemanente', `S/ ${(baseAyer + paraGasolina).toFixed(2)}`);

    document.getElementById('paso2_resultado').classList.add('d-none');
    document.getElementById('paso3_reparto').classList.remove('d-none');
}

function reiniciarCierre() { 
    document.getElementById('paso1_conteo').classList.remove('d-none'); 
    document.getElementById('paso2_resultado').classList.add('d-none'); 
}

// 7. ASISTENTE BABILONIA (INTACTO)
async function calcularRepartoBabilonia() {
    const btn = document.querySelector('button[onclick="calcularRepartoBabilonia()"]');
    const txt = btn.innerHTML; 
    btn.innerHTML = '<i class="fas fa-calculator fa-spin"></i>'; 
    btn.disabled = true;
    
    try {
        const res = await fetch(`${API_URL.replace('/viajes', '')}/reparto/sugerencia`); 
        const json = await res.json();
        
        if (!json.success) throw new Error(json.message);
        
        const { sugerido } = json.data;
        const totalStr = prompt(`💰 GANANCIA NETA SISTEMA: S/ ${parseFloat(sugerido).toFixed(2)}\n\n¿Monto a repartir?`, sugerido);
        
        if (!totalStr || isNaN(totalStr)) return;
        
        const total = parseFloat(totalStr);
        // Lógica Babilonia: 10/10/80
        const pPer = total * 0.1, pArca = total * 0.1, op = total * 0.8;
        const pMant = op * 0.2, pDeuda = op * 0.3, pGas = op * 0.5;

        if (confirm(`🏛️ PLAN REPARTO (S/ ${total}):\n\n👑 10% TÚ: S/ ${pPer.toFixed(2)}\n💰 10% ARCA: S/ ${pArca.toFixed(2)}\n🚜 80% OPERACIÓN: S/ ${op.toFixed(2)}\n   - 🛠️ Taller: ${pMant.toFixed(2)}\n   - 📉 Deudas: ${pDeuda.toFixed(2)}\n   - ⛽ Caja Mañana: ${pGas.toFixed(2)}\n\n¿Transferir?`)) {
            abrirModalTransferencia();
            document.getElementById('montoTransferencia').value = pDeuda.toFixed(2);
        }
    } catch (e) { 
        console.error(e);
        // Fallback manual
        const manual = prompt("No se pudo calcular automático.\n¿Monto a repartir?", "0");
        if(manual) abrirModalTransferencia();
    } finally { 
        btn.innerHTML = txt; btn.disabled = false; 
    }
}

function descargarReporteFinanciero() { 
    if(confirm("¿Descargar Reporte de Gastos e Ingresos?")) window.location.href = `${API_URL}/reporte/finanzas`; 
}

// 8. ESTADÍSTICAS AVANZADAS
function abrirEstadisticas() { 
    new bootstrap.Modal(document.getElementById('modalEstadisticas')).show(); 
    filtrarEstadisticas('mes'); 
}

function filtrarEstadisticas(rango) {
    const hoy = new Date(); 
    let inicio = new Date(), fin = new Date();
    
    // Limpieza botones
    document.querySelectorAll('#modalEstadisticas .btn').forEach(b => { 
        b.classList.remove('active', 'btn-outline-info'); 
        if(!b.classList.contains('btn-info')) b.classList.add('btn-outline-light'); 
    });
    
    if(rango === 'ayer') { inicio.setDate(hoy.getDate()-1); fin.setDate(hoy.getDate()-1); }
    else if(rango === 'semana') inicio.setDate(hoy.getDate()-7);
    else if(rango === 'mes') inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    else if(rango === '3meses') inicio.setMonth(hoy.getMonth()-3);
    else if(rango === 'anio') inicio = new Date(hoy.getFullYear(), 0, 1);

    const off = 5 * 3600 * 1000; 
    const dStr = new Date(inicio.getTime()-off).toISOString().split('T')[0];
    const hStr = new Date(fin.getTime()-off).toISOString().split('T')[0];
    
    document.getElementById('filtroDesde').value = dStr; 
    document.getElementById('filtroHasta').value = hStr;
    
    cargarDatosGrafico(dStr, hStr);
}

function aplicarFiltroManual() {
    const d = document.getElementById('filtroDesde').value, h = document.getElementById('filtroHasta').value;
    if(!d || !h) return notificar("Fechas incompletas", "error");
    cargarDatosGrafico(d, h);
}

async function cargarDatosGrafico(desde, hasta) {
    try {
        const res = await fetch(`${API_URL}/finanzas/grafico-gastos?desde=${desde}&hasta=${hasta}`);
        if (!res.ok) throw new Error("Error HTTP");
        const r = await res.json();
        
        if (r.success) {
            if (r.data.length === 0) notificar("Sin datos en este rango", "info");
            if (typeof renderizarGraficoGastos === 'function') renderizarGraficoGastos(r.labels, r.data);
        }
    } catch (e) { notificar("Error estadisticas", "error"); }
}