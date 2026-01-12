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
let mapaGlobal = null; // Para guardar la instancia del mapa y no crear duplicados

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
        const response = await fetch(`${API_URL}/resumen`); // Asegúrate que la ruta coincida
        const result = await response.json();

        if (result.success) {
            const total = parseFloat(result.total);
            const meta = parseFloat(result.meta);

            // 1. Actualizar Número Grande
            document.getElementById('lblTotalDia').innerText = total.toFixed(2);

            // 2. Actualizar Barra de Progreso
            const porcentaje = (total / meta) * 100;
            const barra = document.getElementById('barraMeta');
            const textoMeta = document.getElementById('lblMetaTexto');

            // Limitamos al 100% visualmente para que no se salga, pero cambiamos color si superamos
            const anchoVisual = porcentaje > 100 ? 100 : porcentaje;
            
            barra.style.width = `${anchoVisual}%`;
            textoMeta.innerText = `Meta: S/ ${meta} (${porcentaje.toFixed(0)}%)`;

            // Efectos visuales de éxito
            if (porcentaje >= 100) {
                barra.classList.remove('bg-warning');
                barra.classList.add('bg-success'); // Se pone verde si cumples
                textoMeta.innerHTML = `<i class="fas fa-trophy text-warning"></i> ¡META SUPERADA! S/ ${meta}`;
            } else {
                barra.classList.remove('bg-success');
                barra.classList.add('bg-warning');
            }
        }
    } catch (e) {
        console.error(e);
    }
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
async function calcularRepartoBabilonia() {
    const btn = document.querySelector('button[onclick="calcularRepartoBabilonia()"]');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-calculator fa-spin"></i> Calculando...';
    btn.disabled = true;

    try {
        // 1. Consultar al cerebro cuánto hay en caja hoy
        const response = await fetch(`${API_URL.replace('/viajes', '')}/reparto/sugerencia`); 
        // Nota: Ajustamos la URL base si API_URL apunta a /viajes. 
        // Si API_URL es '/api/viajes', esto lo cambia a '/api/reparto/sugerencia' si la ruta está bien definida, 
        // O mejor, usa la ruta absoluta: '/api/reparto/sugerencia' si definiste la ruta base en server.js.
        // ASUMIENDO QUE TUS RUTAS ESTÁN TODAS EN EL MISMO ROUTER:
        // Usaremos '/api/reparto/sugerencia' directo.
        
        const res = await fetch('/api/viajes/reparto/sugerencia'); // Asegúrate que coincida con tu server.js
        const json = await res.json();

        if (!json.success) throw new Error(json.message);

        const { ingresos, gastos, sugerido } = json.data;

        // 2. Mostrar la sugerencia
        const ingresoTotal = prompt(
            `📊 CIERRE DEL DÍA\n\n` +
            `🟢 Ingresos: S/ ${parseFloat(ingresos).toFixed(2)}\n` +
            `🔴 Gastos: S/ ${parseFloat(gastos).toFixed(2)}\n` +
            `-------------------------\n` +
            `💰 GANANCIA NETA: S/ ${parseFloat(sugerido).toFixed(2)}\n\n` +
            `¿Qué monto deseas repartir?`, 
            sugerido // Valor por defecto
        );

        if (!ingresoTotal || isNaN(ingresoTotal)) return;

        const total = parseFloat(ingresoTotal);

        // 3. Aplicar Regla 10-10-80
        const pagoPersonal = total * 0.10;
        const ahorroRiqueza = total * 0.10;
        const operativo = total * 0.80; 
        
        // Sub-reparto del operativo (Ajustable)
        const paraMantenimiento = operativo * 0.20;
        const paraDeuda = operativo * 0.30;
        // El resto se queda en efectivo para mañana (Gasolina, sencillo)
        const paraSiguienteDia = operativo * 0.50; 

        const mensaje = `
        🏛️ PLAN DE REPARTO (Sobre S/ ${total}):
        
        👑 10% TÚ (Bolsillo): S/ ${pagoPersonal.toFixed(2)}
        💰 10% ARCA (Ahorro): S/ ${ahorroRiqueza.toFixed(2)}
        
        🚜 80% OPERACIÓN (S/ ${operativo.toFixed(2)}):
           - 🛠️ Taller: S/ ${paraMantenimiento.toFixed(2)}
           - 📉 Deudas: S/ ${paraDeuda.toFixed(2)}
           - ⛽ Caja Mañana: S/ ${paraSiguienteDia.toFixed(2)}
        
        ¿Abrir transferencias para mover el dinero?`;

        if (confirm(mensaje)) {
            abrirModalTransferencia();
            // Truco: Podríamos pre-llenar el monto en el modal de transferencia si quisieras
            document.getElementById('montoTransferencia').value = paraDeuda.toFixed(2); // Sugerimos pagar deuda primero
        }

    } catch (error) {
        console.error(error);
        // Fallback manual si falla el servidor
        const manual = prompt("No se pudo calcular automático.\n¿Monto a repartir?", "0");
        if(manual) abrirModalTransferencia();
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
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

            // --- NUEVO: LLENAR LISTA DE MOVIMIENTOS ---
            const divMovimientos = document.getElementById('listaMovimientos');
            if (divMovimientos) {
                if (data.movimientos && data.movimientos.length > 0) {
                    let htmlMovs = '';
                    data.movimientos.forEach(mov => {
                        // Definir iconos y colores según tipo
                        let icono = 'fa-circle';
                        let color = 'text-white';
                        let signo = '';

                        if (mov.tipo === 'INGRESO') {
                            icono = 'fa-arrow-up';
                            color = 'text-success';
                            signo = '+';
                        } else if (mov.tipo === 'GASTO') {
                            icono = 'fa-arrow-down';
                            color = 'text-danger';
                            signo = '-';
                        } else if (mov.tipo === 'PAGO_DEUDA') {
                            icono = 'fa-check-double';
                            color = 'text-info'; // Celeste para pagos de deuda
                            signo = '-';
                        } else if (mov.tipo === 'TRANSFERENCIA') {
                            icono = 'fa-exchange-alt';
                            color = 'text-warning';
                            signo = ' ';
                        }

                        htmlMovs += `
                        <div class="d-flex justify-content-between align-items-center border-bottom border-secondary py-2">
                            <div class="d-flex align-items-center">
                                <div class="me-3 ${color}"><i class="fas ${icono}"></i></div>
                                <div>
                                    <div class="small fw-bold text-white">${mov.descripcion}</div>
                                    <div class="text-muted" style="font-size: 0.7rem;">${mov.fecha_fmt}</div>
                                </div>
                            </div>
                            <div class="fw-bold ${color}">${signo} S/ ${parseFloat(mov.monto).toFixed(2)}</div>
                        </div>`;
                    });
                    divMovimientos.innerHTML = htmlMovs;
                } else {
                    divMovimientos.innerHTML = '<div class="text-center text-muted small py-3">Sin movimientos recientes</div>';
                }
            }
            // -------------------------------------------
            
            
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
                
                // CORRECCIÓN DE FECHA:
                // 1. Nos aseguramos de tener un objeto fecha válido
                const fechaObj = new Date(item.fecha_vencimiento);
                
                // 2. Ajustamos la zona horaria para que no se atrase un día por culpa del UTC
                // (Sumamos la diferencia horaria de tu zona)
                const userTimezoneOffset = fechaObj.getTimezoneOffset() * 60000;
                const fechaAjustada = new Date(fechaObj.getTime() + userTimezoneOffset);

                // 3. Formateamos bonito (Ej: 20/01/2026)
                const fechaBonita = fechaAjustada.toLocaleDateString('es-PE', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                });

                // CÁLCULOS DE VISUALIZACIÓN
                const dias = parseInt(item.dias_restantes);
                
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
    const titulo = document.getElementById('nuevaObliTitulo').value;
    const monto = document.getElementById('nuevaObliMonto').value;
    const fecha = document.getElementById('nuevaObliFecha').value;
    const prioridad = document.getElementById('nuevaObliPrioridad').value;

    if (!titulo || !monto || !fecha) {
        alert("⚠️ Por favor completa Título, Monto y Fecha.");
        return;
    }

    const btnGuardar = document.querySelector('#modalObligaciones button.btn-success');
    const textoOriginal = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const response = await fetch(`${API_URL}/obligaciones`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ titulo, monto, fecha, prioridad })
        });
        
        // LEEMOS LA RESPUESTA REAL DEL SERVIDOR
        const result = await response.json();

        if (result.success) {
            // ¡Éxito!
            document.getElementById('nuevaObliTitulo').value = '';
            document.getElementById('nuevaObliMonto').value = '';
            document.getElementById('nuevaObliFecha').value = '';
            
            // Recargar lista
            await cargarObligaciones();
            alert("✅ Gasto registrado correctamente");
        } else {
            // Error del Servidor
            alert("❌ Error al guardar: " + (result.message || "Error desconocido"));
        }

    } catch (e) { 
        console.error(e);
        alert("❌ Error de Conexión: Verifica tu internet o el servidor."); 
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = textoOriginal;
    }
}

// NUEVO: CREAR PRÉSTAMO GRANDE (COMPROMISO)
async function crearPrestamo() {
    const titulo = document.getElementById('presTitulo').value;
    const monto = document.getElementById('presMonto').value;
    const dia = document.getElementById('presDia').value;
    
    // Detectar Tipo
    const esServicio = document.getElementById('tipoServicio').checked;
    const tipo = esServicio ? 'SERVICIO' : 'PRESTAMO';
    
    // Si es servicio, forzamos 12 si está vacío o bloqueado
    let cuotas = document.getElementById('presCuotas').value;
    if (esServicio) cuotas = 12; 

    if (!titulo || !monto || !cuotas || !dia) {
        alert("Completa todos los datos del contrato");
        return;
    }

    if(confirm(`¿Generar cronograma para "${titulo}"?\nTipo: ${tipo}\nMonto: S/ ${monto}\nInicio: Día ${dia}`)) {
        
        try {
            const res = await fetch(`${API_URL}/compromisos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo, 
                    tipo: tipo, // Enviamos el tipo
                    monto_total: (tipo === 'PRESTAMO' ? (monto * cuotas) : 0), // Solo relevante en préstamos
                    monto_cuota: monto, // En este form, el usuario ingresa la cuota mensual
                    cuotas_totales: cuotas,
                    dia_pago: dia
                })
            });
            const data = await res.json();
            
            if(data.success) {
                alert("✅ Cronograma creado exitosamente");
                // Limpiar
                document.getElementById('presTitulo').value = '';
                document.getElementById('presMonto').value = '';
                cargarObligaciones();
            } else {
                alert("Error: " + data.message);
            }
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
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
    // 1. Obtener la fecha del input
    const inputFecha = document.getElementById('filtroFechaHistorial');
    let fechaSeleccionada = inputFecha.value;

    // Si el input está vacío (primera carga), ponemos la fecha de HOY automáticamente
    if (!fechaSeleccionada) {
        const hoy = new Date();
        // Ajuste zona horaria Perú manual para el valor del input
        hoy.setHours(hoy.getHours() - 5); 
        fechaSeleccionada = hoy.toISOString().split('T')[0];
        inputFecha.value = fechaSeleccionada;
    }

    try {
        // 2. Enviamos la fecha al servidor
        const response = await fetch(`${API_URL}/historial?fecha=${fechaSeleccionada}`);
        const resultado = await response.json();

        if (resultado.success) {
            const lista = resultado.data;
            const contenedor = document.getElementById('listaHistorial');
            const mensajeVacio = document.getElementById('msgVacio');

            contenedor.innerHTML = '';

            if (lista.length === 0) {
                mensajeVacio.classList.remove('d-none');
                return;
            }
            mensajeVacio.classList.add('d-none');

            // Dibujar tarjetas (Tu código de diseño clásico se mantiene igual)
            lista.forEach(viaje => {
                let badgeColor = 'bg-secondary';
                if(viaje.origen_tipo === 'INDRIVER') badgeColor = 'bg-success';
                if(viaje.origen_tipo === 'UBER') badgeColor = 'bg-light text-dark';
                if(viaje.origen_tipo === 'CALLE') badgeColor = 'bg-warning text-dark';
                
                const iconoPago = viaje.metodo_cobro_id === 1 
                    ? '<i class="fas fa-money-bill-wave text-success"></i>' 
                    : '<i class="fas fa-qrcode text-warning"></i>';

                // Usamos viaje.id para el mapa y anular
                const html = `
                <div class="card bg-dark border-secondary mb-2">
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
                            ${viaje.origen_texto ? `<div class="text-muted text-truncate" style="font-size: 0.65rem; max-width: 150px;">📍 ${viaje.origen_texto}</div>` : ''}
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

async function verMapa(idViaje) {
    // 1. Abrir Modal
    const modalEl = document.getElementById('modalMapa');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // 2. Pedir datos al servidor
    try {
        const response = await fetch(`${API_URL}/ruta/${idViaje}`); // Usamos la nueva ruta
        const resultado = await response.json();

        if (resultado.success) {
            const puntos = resultado.data;
            if (puntos.length === 0) {
                document.getElementById('mapaLeaflet').innerHTML = '<div class="text-white p-5 text-center">No hay datos GPS para este viaje.</div>';
                return;
            }

            // 3. Inicializar Mapa (Si ya existe, lo limpiamos)
            // Esperamos un poco a que el modal cargue para que el mapa calcule su tamaño
            setTimeout(() => {
                if (mapaGlobal) {
                    mapaGlobal.remove(); // Borramos el mapa anterior para no sobreponer
                }
                
                // Centramos el mapa en el primer punto
                const latInicio = parseFloat(puntos[0].lat);
                const lngInicio = parseFloat(puntos[0].lng);
                mapaGlobal = L.map('mapaLeaflet').setView([latInicio, lngInicio], 15);

                // Capa de Mapa (Usamos OpenStreetMap - Gratis)
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(mapaGlobal);

                // 4. Dibujar Marcadores
                let coordenadasLinea = [];

                puntos.forEach(p => {
                    const lat = parseFloat(p.lat);
                    const lng = parseFloat(p.lng);
                    coordenadasLinea.push([lat, lng]);

                    let color = 'blue';
                    let titulo = 'Parada';

                    if (p.tipo === 'INICIO') { 
                        color = 'green'; titulo = 'Inicio Carrera'; 
                        // Icono Verde
                        L.marker([lat, lng], { title: titulo }).addTo(mapaGlobal)
                            .bindPopup(`<b>🏁 Inicio</b><br>${p.fecha}`);
                    } 
                    else if (p.tipo === 'FIN') { 
                        color = 'red'; titulo = 'Fin Carrera'; 
                         // Icono Rojo (Leaflet no tiene colores nativos fáciles, usaremos popup para diferenciar)
                         L.marker([lat, lng], { title: titulo }).addTo(mapaGlobal)
                            .bindPopup(`<b>🏁 Destino</b><br>${p.fecha}`).openPopup();
                    } 
                    else {
                        // Parada intermedia
                        L.circleMarker([lat, lng], { color: 'yellow', radius: 5 }).addTo(mapaGlobal)
                            .bindPopup('Parada');
                    }
                });

                // 5. Dibujar Línea Azul conectando puntos
                if (coordenadasLinea.length > 1) {
                    const polyline = L.polyline(coordenadasLinea, { color: 'blue', weight: 4 }).addTo(mapaGlobal);
                    // Ajustar zoom para ver toda la ruta
                    mapaGlobal.fitBounds(polyline.getBounds());
                }

                // Truco para arreglar bug de Leaflet en Modales (si sale gris)
                mapaGlobal.invalidateSize();

            }, 300); // 300ms de retraso para asegurar que el modal se abrió

        } else {
            alert("Error cargando ruta");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión");
    }
}


// Función visual para cambiar el placeholder según selección
function toggleTipoCompromiso() {
    const esServicio = document.getElementById('tipoServicio').checked;
    const inputCuotas = document.getElementById('presCuotas');
    
    if (esServicio) {
        inputCuotas.value = 12; // Por defecto 1 año
        inputCuotas.disabled = true; // Bloqueamos para que sea rápido
        inputCuotas.placeholder = "12 Meses";
    } else {
        inputCuotas.value = '';
        inputCuotas.disabled = false;
        inputCuotas.placeholder = "N° Cuotas";
    }
}

// INIT
window.onload = function() {
    cargarResumenDia();
    cargarHistorial();
    cargarMetaDiaria();
};