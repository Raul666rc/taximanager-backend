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
// Función para convertir GPS a Texto (Calle/Avenida) GRATIS
async function obtenerDireccionGPS(lat, lng) {
    try {
        // Usamos la API de OpenStreetMap (Nominatim)
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': 'TaxiManagerApp/1.0' } // Es buena práctica identificarse
        });
        const data = await response.json();

        if (data && data.address) {
            // Tratamos de armar una dirección corta y útil
            const calle = data.address.road || data.address.pedestrian || '';
            const numero = data.address.house_number || '';
            const barrio = data.address.neighbourhood || data.address.suburb || '';
            
            // Ej: "Av. Arequipa 500, Lince"
            let direccion = `${calle} ${numero}`.trim();
            if (barrio) direccion += `, ${barrio}`;
            
            return direccion || "Dirección desconocida";
        }
        return "Ubicación sin nombre";
    } catch (error) {
        console.error("Error obteniendo dirección:", error);
        return "Error GPS Red"; // Si falla internet, guardamos esto
    }
}
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
async function iniciarCarrera() {
    if (!navigator.geolocation) return alert("Tu navegador no soporta GPS");

    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    
    const btn = document.getElementById('btnIniciar');
    const textoOriginal = btn.innerHTML;
    
    // Feedback visual
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> Detectando Calle...';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // 1. GUARDAR INICIO PARA CÁLCULOS
                viajeInicioCoords = { lat, lng };
                viajeInicioTime = new Date();

                // 2. ¡MAGIA! OBTENER NOMBRE DE LA CALLE AUTOMÁTICAMENTE
                const direccionDetectada = await obtenerDireccionGPS(lat, lng);
                console.log("Origen detectado:", direccionDetectada);

                const datos = {
                    origen_tipo: appSeleccionada,
                    origen_texto: direccionDetectada, // <--- Enviamos lo que detectó el satélite
                    lat: lat, 
                    lng: lng
                };

                const response = await fetch(`${API_URL}/iniciar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });

                const resultado = await response.json();

                if (resultado.success) {
                    viajeActualId = resultado.data.id_viaje;
                    document.getElementById('selectorApps').classList.add('d-none');
                    
                    // Opcional: Mostrar un toast o alerta pequeña de dónde estás
                    // alert(`Carrera iniciada en: ${direccionDetectada}`); 
                    
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
        { enableHighAccuracy: true }
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
async function guardarCarrera() {
    const montoInput = document.querySelector('#modalCobrar input[type="number"]').value;
    const esYape = document.getElementById('pago2').checked; 
    const metodoId = esYape ? 2 : 1;

    if (!montoInput || montoInput <= 0) return alert("Ingresa un monto válido");

    const btnCobrar = document.querySelector('#modalCobrar .btn-success');
    const textoBtn = btnCobrar.innerText;
    btnCobrar.disabled = true;
    btnCobrar.innerHTML = '<i class="fas fa-sync fa-spin"></i> Finalizando...';

    // Obtenemos GPS Final
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const latFin = position.coords.latitude;
            const lngFin = position.coords.longitude;

            // 1. CÁLCULOS AUTOMÁTICOS DE DISTANCIA/TIEMPO
            let distancia = 0;
            if (viajeInicioCoords) {
                distancia = calcularDistancia(viajeInicioCoords.lat, viajeInicioCoords.lng, latFin, lngFin);
            }
            
            let duracion = 0;
            if (viajeInicioTime) {
                const diffMs = new Date() - viajeInicioTime;
                duracion = Math.floor(diffMs / 60000); 
            }

            // 2. ¡MAGIA! DETECTAR DESTINO AUTOMÁTICAMENTE
            const destinoDetectado = await obtenerDireccionGPS(latFin, lngFin);
            console.log("Destino detectado:", destinoDetectado);

            const datos = {
                id_viaje: viajeActualId,
                monto: parseFloat(montoInput),
                metodo_pago_id: metodoId,
                lat: latFin,
                lng: lngFin,
                distancia_km: distancia,
                duracion_min: duracion,
                destino_texto: destinoDetectado // <--- Enviamos la calle detectada
            };

            const response = await fetch(`${API_URL}/finalizar`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });

            const resultado = await response.json();

            if (resultado.success) {
                // Mensaje informativo bonito
                alert(`✅ Completado\n🏁 Destino: ${destinoDetectado}\n📏 Distancia: ${distancia} km\n⏱️ Tiempo: ${duracion} min`);
                
                var modal = bootstrap.Modal.getInstance(document.getElementById('modalCobrar'));
                modal.hide();

                mostrarPanelInicio();
                cargarHistorial();
                cargarResumenDia();
                cargarMetaDiaria(); 
            } else {
                alert("Error: " + resultado.message);
            }

        } catch (error) {
            console.error(error);
            alert("Error al cobrar");
        } finally {
            btnCobrar.disabled = false;
            btnCobrar.innerText = textoBtn;
        }
    });
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
    const div = document.getElementById('listaObligaciones');
    div.innerHTML = '<div class="text-center text-muted">Cargando...</div>';
    
    try {
        const res = await fetch(`${API_URL}/obligaciones`);
        const json = await res.json();
        
        if (json.success && json.data.length > 0) {
            let html = '';
            json.data.forEach(item => {
                const dias = parseInt(item.dias_restantes);
                let color = dias < 3 ? 'border-danger' : (dias < 7 ? 'border-warning' : 'border-success');
                let badge = dias < 0 ? `<span class="badge bg-danger">VENCIDO (${Math.abs(dias)}d)</span>` : `<small class="text-muted">${dias} días rest.</small>`;
                
                html += `
                <div class="list-group-item bg-dark text-white p-3 mb-2 border-start border-4 ${color}">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h6 class="mb-0 fw-bold">${item.titulo}</h6>
                            ${badge}
                        </div>
                        <div class="text-end">
                            <div class="fw-bold">S/ ${parseFloat(item.monto).toFixed(2)}</div>
                            <button class="btn btn-sm btn-outline-light mt-1" onclick="pagarDeuda(${item.id}, ${item.monto}, '${item.titulo}')">PAGAR</button>
                        </div>
                    </div>
                </div>`;
            });
            div.innerHTML = html;
        } else {
            div.innerHTML = '<div class="p-3 text-center text-muted">No tienes deudas pendientes 🎉</div>';
        }
    } catch (e) { div.innerHTML = 'Error cargar'; }
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
    const res = await fetch(`${API_URL}/historial`);
    const json = await res.json();
    const div = document.getElementById('listaHistorial');
    div.innerHTML = '';
    
    if(json.success && json.data.length > 0) {
        document.getElementById('msgVacio').classList.add('d-none');
        json.data.forEach(v => {
            // Mostrar texto de origen si existe, sino el tipo
            const titulo = v.origen_texto ? `<small>${v.origen_texto}</small>` : v.origen_tipo;
            
            div.innerHTML += `
            <div class="card bg-dark border-secondary mb-2">
                <div class="card-body p-2 d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold text-white">${titulo}</div>
                        <div class="small text-muted">${v.hora_fin} (${v.dia_mes})</div>
                    </div>
                    <div class="text-end">
                        <div class="fs-5 text-white fw-bold">S/ ${parseFloat(v.monto_cobrado).toFixed(2)}</div>
                        <button class="btn btn-sm btn-outline-danger border-0" onclick="anularCarrera(${v.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        });
    } else {
        document.getElementById('msgVacio').classList.remove('d-none');
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