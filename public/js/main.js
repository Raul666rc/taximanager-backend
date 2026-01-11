// public/js/main.js

// --- 1. VERIFICACIÓN DE SEGURIDAD ---
const usuarioLogueado = localStorage.getItem('taxi_user');
if (!usuarioLogueado) window.location.href = 'login.html';

const API_URL = '/api/viajes';

// VARIABLES GLOBALES
let viajeActualId = null; 
let viajeInicioCoords = null; // Para calcular distancia
let viajeInicioTime = null;   // Para calcular duración
let miGrafico = null; 
let miGraficoBarras = null;

// --- UTILIDADES ---
// Función matemática para calcular distancia entre dos coordenadas (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    if(!lat1 || !lat2) return 0;
    const R = 6371; // Radio de la tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(2); // Retorna Km con 2 decimales
}

// --- UI ---
function mostrarPanelCarrera() {
    document.getElementById('btnIniciar').classList.add('d-none');
    document.getElementById('panelEnCarrera').classList.remove('d-none');
    // Mostrar hora de inicio
    document.getElementById('txtCronometro').innerText = "En curso: " + new Date().toLocaleTimeString();
}

function mostrarPanelInicio() {
    document.getElementById('panelEnCarrera').classList.add('d-none');
    document.getElementById('btnIniciar').classList.remove('d-none');
    const selector = document.getElementById('selectorApps');
    if(selector) selector.classList.remove('d-none');
    
    document.querySelector('#modalCobrar input[type="number"]').value = '';
    viajeActualId = null;
    viajeInicioCoords = null;
}

// ==========================================
// 1. INICIAR CARRERA (V3.0 con Texto y GPS)
// ==========================================
// 1. INICIAR CARRERA (RÁPIDO)
async function iniciarCarrera() {
    if (!navigator.geolocation) return alert("Tu navegador no soporta GPS");

    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    
    // Si existe el input origen (en el HTML), lo tomamos, sino vacío
    const origenTexto = document.getElementById('inputOrigen')?.value || '';

    const btn = document.getElementById('btnIniciar');
    const textoOriginal = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> GPS...';
    btn.disabled = true;

    // OPCIONES GPS PARA VELOCIDAD:
    const opcionesGPS = { 
        enableHighAccuracy: true, 
        timeout: 5000, 
        maximumAge: 30000 // <--- ESTO ES LA CLAVE DE LA VELOCIDAD (Acepta cache de 30seg)
    };

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                // Guardamos coordenadas de inicio
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
                    
                    // Ocultar selector si existe
                    const sel = document.getElementById('selectorApps');
                    if(sel) sel.classList.add('d-none');
                    
                    mostrarPanelCarrera();
                } else {
                    alert("Error: " + resultado.message);
                }

            } catch (error) {
                console.error(error);
                alert("Error de conexión");
            } finally {
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
            }
        },
        (error) => {
            alert("⚠️ Error GPS: " + error.message);
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        },
        opcionesGPS // <--- Pasamos las opciones aquí
    );
}

// 2. REGISTRAR PARADA
async function registrarParada() {
    if (!viajeActualId) return;
    
    // Usamos GPS real para la parada
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
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
            alert("📍 Parada registrada");
        } catch (e) { console.error(e); }
    });
}

// ==========================================
// 3. FINALIZAR Y COBRAR (V3.0 Completo)
// ==========================================
// 3. FINALIZAR Y COBRAR (RÁPIDO)
async function guardarCarrera() {
    const montoInput = document.querySelector('#modalCobrar input[type="number"]').value;
    const esYape = document.getElementById('pago2').checked; 
    const metodoId = esYape ? 2 : 1;
    const destinoManual = document.getElementById('inputDestino')?.value || '';

    if (!montoInput || montoInput <= 0) return; // Si está vacío, no hace nada (sin alerta molesta)

    const btnCobrar = document.querySelector('#modalCobrar .btn-success');
    const textoBtn = btnCobrar.innerText;
    
    // Feedback visual rápido
    btnCobrar.disabled = true;
    btnCobrar.className = 'btn btn-warning w-100 btn-lg fw-bold'; // Se pone amarillo
    btnCobrar.innerHTML = '<i class="fas fa-sync fa-spin"></i> Procesando...';

    // OPCIONES GPS ULTRA RÁPIDAS (Usamos caché viejo si existe)
    const opcionesGPS = { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 };

    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const latFin = position.coords.latitude;
            const lngFin = position.coords.longitude;

            // Cálculos rápidos
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

            // Enviamos sin esperar respuesta visual
            const response = await fetch(`${API_URL}/finalizar`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });

            const resultado = await response.json();

            if (resultado.success) {
                // ¡AQUÍ ESTÁ EL CAMBIO!
                // NO mostramos alert(). Simplemente cerramos todo.
                
                // 1. Ocultar Modal
                const modalEl = document.getElementById('modalCobrar');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();

                // 2. Actualizar Dashboard en silencio
                mostrarPanelInicio();
                cargarHistorial();
                cargarResumenDia();
                cargarMetaDiaria(); 

                // 3. Restaurar botón (por si lo abres luego)
                setTimeout(() => {
                    btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
                    btnCobrar.innerHTML = textoBtn;
                    btnCobrar.disabled = false;
                }, 500);

            } else {
                // Solo mostramos alerta si hubo ERROR REAL
                alert("Error: " + resultado.message);
                btnCobrar.disabled = false;
                btnCobrar.innerHTML = textoBtn;
                btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
            }

        } catch (error) {
            console.error(error);
            alert("Error de conexión");
            btnCobrar.disabled = false;
        }
    }, (err) => {
        // Si falla el GPS final, guardamos igual con lat 0 (Para no trabarte)
        console.warn("GPS falló al cerrar, guardando sin coords fin");
        // ... (Podrías repetir la lógica de fetch aquí, pero para simplificar dejamos que intente de nuevo)
        alert("GPS Lento: Intenta de nuevo (Acércate a la ventana)");
        btnCobrar.disabled = false;
        btnCobrar.innerHTML = textoBtn;
        btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
    }, opcionesGPS);
}

// --- CARGA DE DATOS ---

async function cargarResumenDia() {
    try {
        const response = await fetch(`${API_URL}/resumen`);
        const resultado = await response.json();
        if (resultado.success) {
            document.getElementById('gananciaDia').innerText = `S/ ${parseFloat(resultado.total).toFixed(2)}`;
        }
    } catch (e) { console.error(e); }
}

async function cargarMetaDiaria() {
    try {
        const response = await fetch(`${API_URL}/billetera?periodo=hoy`);
        const resultado = await response.json();

        if (resultado.success) {
            const data = resultado.data;
            const gananciaHoy = parseFloat(data.ganancia_hoy) || 0; 
            const meta = parseFloat(data.meta_diaria) || 200;

            let porcentaje = (gananciaHoy / meta) * 100;
            if (porcentaje > 100) porcentaje = 100;

            document.getElementById('txtProgreso').innerText = `S/ ${gananciaHoy.toFixed(0)} / ${meta}`;
            document.getElementById('txtPorcentaje').innerText = `${porcentaje.toFixed(0)}%`;
            
            const barra = document.getElementById('barraMeta');
            barra.style.width = `${porcentaje}%`;

            barra.className = 'progress-bar progress-bar-striped progress-bar-animated fw-bold';
            const frase = document.getElementById('fraseMotivacional');

            if (porcentaje < 20) {
                barra.classList.add('bg-warning', 'text-dark');
                frase.innerText = "☕ Arrancando motores (Hora Perú 🇵🇪)";
            } else if (porcentaje < 80) {
                barra.classList.add('bg-info', 'text-dark');
                frase.innerText = "🚕 A buen ritmo.";
            } else {
                barra.classList.add('bg-success');
                frase.innerText = "🎉 ¡META CUMPLIDA!";
            }
        }
    } catch (error) { console.error("Error meta:", error); }
}

async function cambiarMeta() {
    const actual = document.getElementById('txtProgreso').innerText.split('/')[1]?.trim() || "200";
    const nuevaMeta = prompt("¿Meta para hoy?", actual);
    if (!nuevaMeta || isNaN(nuevaMeta)) return;

    try {
        await fetch(`${API_URL}/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nueva_meta: nuevaMeta })
        });
        cargarMetaDiaria();
    } catch (e) { alert("Error"); }
}

// --- GASTOS Y TRANSFERENCIAS ---

async function guardarGasto() {
    const montoInput = document.getElementById('montoGasto');
    const monto = parseFloat(montoInput.value);
    const categoria = document.querySelector('input[name="tipoGasto"]:checked').value;
    const cuentaId = 1; // Por defecto Efectivo (Podríamos agregar un select en el futuro)

    if (!monto || monto <= 0) return alert("Monto inválido");

    try {
        // Usamos la ruta simplificada del Controller
        const response = await fetch(`${API_URL}/gasto`, { // Asegúrate que la ruta en router sea /gasto
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto, descripcion: `Gasto - ${categoria}`, cuenta_id: cuentaId })
        });

        const res = await response.json();
        if (res.success) {
            alert(`💸 Gasto registrado`);
            montoInput.value = '';
            bootstrap.Modal.getInstance(document.getElementById('modalGasto')).hide();
            cargarMetaDiaria();
        } else {
            alert(res.message);
        }
    } catch (e) { alert("Error conexión"); }
}

// ABRIR TRANSFERENCIA CON LAS CUENTAS CORRECTAS (V3.0)
async function abrirModalTransferencia() {
    bootstrap.Modal.getInstance(document.getElementById('modalBilletera')).hide();
    new bootstrap.Modal(document.getElementById('modalTransferencia')).show();

    // LISTA ACTUALIZADA DE TUS CUENTAS (IDs deben coincidir con tu BD)
    const cuentas = [
        {id: 1, nombre: '💵 Efectivo (Bolsillo)'},
        {id: 2, nombre: '🟣 Yape / BCP'},
        {id: 3, nombre: '💰 Warda - Arca (10%)'},
        {id: 4, nombre: '🛠️ Warda - Taller'},
        {id: 5, nombre: '📉 Warda - Deuda 8k'},
        {id: 6, nombre: '🎓 Warda - Emergencia'}
    ];
    
    const selectOrigen = document.getElementById('selectOrigen');
    const selectDestino = document.getElementById('selectDestino');
    let html = '';
    cuentas.forEach(c => html += `<option value="${c.id}">${c.nombre}</option>`);
    
    selectOrigen.innerHTML = html;
    selectDestino.innerHTML = html;
    
    selectOrigen.value = 1; 
    selectDestino.value = 3; 
}

async function ejecutarTransferencia() {
    const origen = document.getElementById('selectOrigen').value;
    const destino = document.getElementById('selectDestino').value;
    const monto = document.getElementById('montoTransferencia').value;

    if (origen === destino) return alert("Origen y destino iguales");
    if (!monto || monto <= 0) return alert("Monto inválido");

    try {
        const response = await fetch(`${API_URL}/transferir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cuenta_origen_id: origen, cuenta_destino_id: destino, monto, nota: 'App' })
        });
        
        const res = await response.json();
        if (res.success) {
            alert("✅ Transferencia realizada");
            bootstrap.Modal.getInstance(document.getElementById('modalTransferencia')).hide();
            abrirBilletera(); 
        } else {
            alert(res.message);
        }
    } catch (e) { alert("Error: " + e.message); }
}

// ASISTENTE BABILONIA (Actualizado con IDs correctos)
function calcularRepartoBabilonia() {
    const ingresoTotal = prompt("¿Producción TOTAL de hoy?", "200");
    if (!ingresoTotal || isNaN(ingresoTotal)) return;

    const total = parseFloat(ingresoTotal);
    const pagoPersonal = total * 0.10;
    const ahorroRiqueza = total * 0.10;
    const operativo = total * 0.80; 
    
    const paraMantenimiento = operativo * 0.20;
    const paraDeuda = operativo * 0.30;
    const paraGasolina = operativo * 0.50;

    const mensaje = `
    🏛️ REPARTO SUGERIDO (10-10-80):
    
    👑 10% TÚ (Yape): S/ ${pagoPersonal.toFixed(0)}
    💰 10% ARCA (Warda 3): S/ ${ahorroRiqueza.toFixed(0)}
    
    🚜 80% OPERATIVO (S/ ${operativo.toFixed(0)}):
       - ⛽ Gasolina (Efec): S/ ${paraGasolina.toFixed(0)}
       - 🛠️ Taller (Warda 4): S/ ${paraMantenimiento.toFixed(0)}
       - 📉 Deuda (Warda 5): S/ ${paraDeuda.toFixed(0)}
    
    ¿Abrir transferencias?`;

    if (confirm(mensaje)) abrirModalTransferencia();
}

// --- BILLETERA Y GRÁFICOS ---
async function abrirBilletera(periodo = 'mes') {
    try {
        const response = await fetch(`${API_URL}/billetera?periodo=${periodo}`);
        const res = await response.json();

        if (res.success) {
            const data = res.data;
            // Llenar saldos
            const saldoEfectivo = data.cuentas.find(c => c.id === 1)?.saldo_actual || 0;
            const saldoYape = data.cuentas.find(c => c.id === 2)?.saldo_actual || 0;
            
            document.getElementById('txtEfectivo').innerText = `S/ ${parseFloat(saldoEfectivo).toFixed(2)}`;
            document.getElementById('txtYape').innerText = `S/ ${parseFloat(saldoYape).toFixed(2)}`;
            document.getElementById('txtAhorro').innerText = `S/ ${parseFloat(data.ahorro_total).toFixed(2)}`;
            document.getElementById('txtGastos').innerText = `S/ ${parseFloat(data.gasto_mensual).toFixed(2)}`;

            // Gráfico Dona
            dibujarDona(data.estadisticas);
            // Gráfico Barras
            dibujarBarras(data.semana);

            // Mostrar Modal
            const modalEl = document.getElementById('modalBilletera');
            if (!modalEl.classList.contains('show')) new bootstrap.Modal(modalEl).show();
        }
    } catch (e) { console.error(e); }
}

function dibujarDona(stats) {
    const ctx = document.getElementById('graficoApps').getContext('2d');
    if (miGrafico) miGrafico.destroy();
    
    const labels = stats.length ? stats.map(e => e.origen_tipo) : ['Sin datos'];
    const values = stats.length ? stats.map(e => e.total) : [1];
    const colors = labels.map(n => n==='INDRIVER'?'#198754':(n==='UBER'?'#f8f9fa':'#ffc107'));

    miGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
        options: { plugins: { legend: { position: 'right', labels: { color: 'white' } } } }
    });
}

function dibujarBarras(semana) {
    const canvas = document.getElementById('graficoSemana');
    if (!canvas) return;
    if (miGraficoBarras) miGraficoBarras.destroy();

    const diasMap = { 'Monday':'Lun', 'Tuesday':'Mar', 'Wednesday':'Mié', 'Thursday':'Jue', 'Friday':'Vie', 'Saturday':'Sáb', 'Sunday':'Dom' };
    const labels = (semana || []).map(i => diasMap[i.dia_nombre] || i.dia_nombre);
    const data = (semana || []).map(i => i.total);

    miGraficoBarras = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: '#ffc107', borderRadius: 4 }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#fff' } }, y: { ticks: { color: '#aaa' } } } }
    });
}

// --- DEUDAS Y COMPROMISOS (NUEVO) ---

async function abrirObligaciones() {
    new bootstrap.Modal(document.getElementById('modalObligaciones')).show();
    cargarObligaciones();
}

async function cargarObligaciones() {
    const contenedor = document.getElementById('listaObligaciones');
    contenedor.innerHTML = '<div class="text-center p-3 text-muted"><i class="fas fa-spinner fa-spin"></i> Cargando deudas...</div>';

    try {
        const response = await fetch(`${API_URL}/obligaciones`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            let html = '';
            result.data.forEach(item => {
                
                // CÁLCULOS DE VISUALIZACIÓN
                const dias = parseInt(item.dias_restantes);
                
                // Formatear fecha bonita: "20/01/2026"
                // Truco: Agregamos 'T00:00' para evitar problemas de zona horaria al visualizar
                const fechaObj = new Date(item.fecha_vencimiento + 'T00:00:00');
                const fechaBonita = fechaObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

                // Semáforo de colores
                let bordeColor = 'border-secondary';
                let badgeEstado = '';

                if (item.prioridad === 'URGENTE' || dias < 3) {
                    bordeColor = 'border-danger border-start border-4'; 
                    badgeEstado = `<span class="badge bg-danger mb-1">🔥 Vence en ${dias} días</span>`;
                } else if (item.prioridad === 'ALTA' || dias < 7) {
                    bordeColor = 'border-warning border-start border-4'; 
                    badgeEstado = `<span class="badge bg-warning text-dark mb-1">⚠️ Quedan ${dias} días</span>`;
                } else {
                    bordeColor = 'border-success border-start border-4'; 
                    badgeEstado = `<span class="badge bg-success mb-1">📅 Faltan ${dias} días</span>`;
                }
                
                // Si ya venció (dias negativo)
                if (dias < 0) {
                    bordeColor = 'border-danger border-start border-4';
                    badgeEstado = `<span class="badge bg-danger w-100 mb-1">¡VENCIDO HACE ${Math.abs(dias)} DÍAS!</span>`;
                }

                // ESTRUCTURA DE LA TARJETA
                html += `
                <div class="list-group-item bg-dark text-white p-3 mb-2 shadow-sm ${bordeColor}">
                    <div class="d-flex justify-content-between align-items-center">
                        
                        <div style="flex: 1;">
                            ${badgeEstado}
                            <h6 class="mb-1 fw-bold text-white">${item.titulo}</h6>
                            <div class="text-info small">
                                <i class="far fa-calendar-alt me-1"></i>Vence: <strong>${fechaBonita}</strong>
                            </div>
                        </div>

                        <div class="text-end ms-3">
                            <div class="fs-4 fw-bold text-white mb-2">S/ ${parseFloat(item.monto).toFixed(2)}</div>
                            <button class="btn btn-sm btn-outline-light w-100" onclick="pagarDeuda(${item.id}, ${item.monto}, '${item.titulo}')">
                                PAGAR <i class="fas fa-chevron-right ms-1"></i>
                            </button>
                        </div>

                    </div>
                </div>`;
            });
            contenedor.innerHTML = html;
            
            // Actualizar contador rojo en el menú principal
            const countBadge = document.getElementById('badgeDeudasCount');
            if(countBadge) {
                countBadge.innerText = result.data.length;
                countBadge.style.display = 'inline-block';
            }

        } else {
            contenedor.innerHTML = '<div class="text-center p-5 text-muted"><i class="fas fa-check-circle fa-2x mb-3 text-success"></i><br>¡Todo pagado! Eres libre.</div>';
        }
    } catch (e) {
        console.error(e);
        contenedor.innerHTML = '<div class="text-danger p-3 text-center">Error al cargar datos</div>';
    }
}

async function crearObligacion() {
    // Lógica simple para crear deuda puntual
    const titulo = document.getElementById('nuevaObliTitulo').value;
    const monto = document.getElementById('nuevaObliMonto').value;
    const fecha = document.getElementById('nuevaObliFecha').value;
    if(!titulo || !monto) return;

    await fetch(`${API_URL}/obligaciones`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ titulo, monto, fecha, prioridad: 'NORMAL' })
    });
    cargarObligaciones();
}

// NUEVO: CREAR PRÉSTAMO GRANDE (COMPROMISO)
async function crearPrestamo() {
    const titulo = document.getElementById('presTitulo').value;
    const monto = document.getElementById('presMonto').value;
    const cuotas = document.getElementById('presCuotas').value;
    const dia = document.getElementById('presDia').value;

    if (!titulo || !monto || !cuotas) return alert("Completa datos");

    if(confirm(`Generar ${cuotas} cuotas para ${titulo}?`)) {
        const res = await fetch(`${API_URL}/compromisos`, { // Ruta correcta
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                titulo, 
                tipo: 'PRESTAMO',
                monto_total: monto,
                monto_cuota: (monto/cuotas).toFixed(2),
                cuotas_totales: cuotas,
                dia_pago: dia
            })
        });
        const data = await res.json();
        if(data.success) {
            alert("Cronograma creado");
            cargarObligaciones();
        } else {
            alert(data.message);
        }
    }
}

async function pagarDeuda(id, monto, titulo) {
    const cuentaId = prompt(`Pagar "${titulo}" (S/ ${monto}).\nOrigen:\n1: Efectivo\n2: Yape\n5: Warda Deuda`);
    if (!cuentaId) return;

    if (confirm("¿Confirmar pago?")) {
        const res = await fetch(`${API_URL}/obligaciones/pagar`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id_obligacion: id, id_cuenta_origen: cuentaId, monto })
        });
        const data = await res.json();
        if(data.success) {
            alert("✅ Pagado");
            cargarObligaciones();
        } else alert(data.message);
    }
}

// Historial y Reporte
async function cargarHistorial() {
    try {
        const response = await fetch(`${API_URL}/historial`);
        const resultado = await response.json();

        if (resultado.success) {
            const lista = resultado.data;
            const contenedor = document.getElementById('listaHistorial');
            const mensajeVacio = document.getElementById('msgVacio');

            // Limpiar lo que había antes
            contenedor.innerHTML = '';

            if (lista.length === 0) {
                mensajeVacio.classList.remove('d-none');
                return;
            }
            mensajeVacio.classList.add('d-none');

            // Recorrer cada viaje y dibujar su tarjeta ESTILO CLÁSICO
            lista.forEach(viaje => {
                // 1. Definir color del Badge según la App
                let badgeColor = 'bg-secondary';
                if(viaje.origen_tipo === 'INDRIVER') badgeColor = 'bg-success';
                if(viaje.origen_tipo === 'UBER') badgeColor = 'bg-light text-dark';
                if(viaje.origen_tipo === 'CALLE') badgeColor = 'bg-warning text-dark';
                if(viaje.origen_tipo === 'OTROS') badgeColor = 'bg-info text-dark';

                // 2. Definir icono de pago (1=Efectivo, 2=Yape)
                const iconoPago = viaje.metodo_cobro_id === 1 
                    ? '<i class="fas fa-money-bill-wave text-success"></i>' // Billete Verde
                    : '<i class="fas fa-qrcode text-warning"></i>';        // QR Amarillo

                // 3. Estructura HTML (Flexbox: Izquierda - Centro - Derecha)
                const html = `
                <div class="card bg-dark border-secondary mb-2">
                    <div class="card-body p-2 d-flex align-items-center">
                        
                        <div class="me-3">
                            <button class="btn btn-outline-danger btn-sm border-0 p-2" onclick="anularCarrera(${viaje.id})">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>

                        <div class="d-flex flex-column flex-grow-1">
                            <div class="mb-1">
                                <span class="badge ${badgeColor}">${viaje.origen_tipo}</span>
                            </div>
                            <div class="text-info small fw-bold" style="font-size: 0.8rem;">
                                <i class="far fa-clock me-1"></i>${viaje.hora_fin} <span class="text-muted ms-1">(${viaje.dia_mes})</span>
                            </div>
                            ${viaje.origen_texto ? `<div class="text-muted" style="font-size: 0.65rem;">📍 ${viaje.origen_texto.substring(0,25)}...</div>` : ''}
                        </div>

                        <div class="text-end ms-2">
                            <div class="fw-bold text-white fs-5 lh-1">S/ ${parseFloat(viaje.monto_cobrado).toFixed(2)}</div>
                            <div class="mt-1 fs-5">${iconoPago}</div>
                        </div>

                    </div>
                </div>`;
                
                contenedor.innerHTML += html;
            });
        }
    } catch (error) {
        console.error("Error cargando historial:", error);
    }
}

async function anularCarrera(id) {
    if(confirm("¿Borrar carrera?")) {
        await fetch(`${API_URL}/anular/${id}`, { method: 'DELETE' });
        cargarHistorial();
        cargarMetaDiaria();
        cargarResumenDia();
    }
}

function descargarExcel() {
    if(confirm("¿Descargar Excel?")) window.location.href = `${API_URL}/reporte`;
}

function cerrarSesion() {
    if(confirm("¿Salir?")) {
        localStorage.removeItem('taxi_user');
        window.location.href = 'login.html';
    }
}

// INIT
window.onload = function() {
    cargarResumenDia();
    cargarHistorial();
    cargarMetaDiaria();
};