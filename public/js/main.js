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
let miGraficoEstadisticas = null;
let miGraficoBarras = null;
let mapaGlobal = null; // Para guardar la instancia del mapa y no crear duplicados
let saldosCache = {}; //Para guardar los saldos momentáneamente

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

/// --- FUNCIÓN DE NOTIFICACIONES (TOASTS) ---
function notificar(mensaje, tipo = 'info') {
    let colorFondo;
    // Colores tipo "Semáforo"
    if (tipo === 'exito') colorFondo = "linear-gradient(to right, #00b09b, #96c93d)"; // Verde
    if (tipo === 'error') colorFondo = "linear-gradient(to right, #ff5f6d, #ffc371)"; // Rojo
    if (tipo === 'info')  colorFondo = "linear-gradient(to right, #2193b0, #6dd5ed)"; // Azul

    Toastify({
        text: mensaje,
        duration: 3000,       // 3 segundos
        gravity: "top",       // Arriba
        position: "center",   // Centro
        style: {
            background: colorFondo,
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            fontWeight: "bold",
            fontSize: "1.1rem" // Un poco más grande para leer fácil
        },
        stopOnFocus: false // Que desaparezca igual aunque lo toques
    }).showToast();
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
    if (!navigator.geolocation) return notificar("❌ Tu navegador no soporta GPS", "error");

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
                    // JUSTO DESPUÉS DE QUE EL SERVIDOR RESPONDE OK:
                    notificar("🚖 Carrera iniciada. ¡Buen viaje!", "info"); // <--- AGREGAR ESTO
                    mostrarPanelCarrera();
                } else {
                    notificar("❌ Error al iniciar carrera", "error");
                }

            } catch (error) {
                console.error(error);
                notificar("Error de conexión", "error");
            } finally {
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
            }
        },
        (error) => {
            notificar("⚠️ Error GPS: " + error.message, "error");
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        },
        opcionesGPS // <--- Pasamos las opciones aquí
    );
}

// 2. REGISTRAR PARADA
async function registrarParada() {
    if (!viajeActualId) return;

    // Función interna para intentar obtener ubicación con plan B
    const obtenerUbicacionRobusta = () => {
        return new Promise((resolve, reject) => {
            
            // INTENTO 1: Rápido (Sin satélite, 3 segundos máximo)
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(pos),
                (err) => {
                    console.warn("⚠️ Falló ubicación rápida. Activando GPS Satelital...", err.message);
                    
                    // INTENTO 2 (Plan B): Satélite (Si falla el rápido, usamos el lento pero seguro)
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve(pos),
                        (errFinal) => reject(errFinal),
                        { enableHighAccuracy: true, timeout: 10000 } // 10 seg tiempo espera
                    );
                },
                { enableHighAccuracy: false, timeout: 3000 }
            );
        });
    };

    try {
        // Feedback visual inmediato
        const btn = document.getElementById('btnParada'); // Asegúrate que tu botón tenga este ID o usa el evento
        if(btn) btn.disabled = true;

        // Ejecutamos la lógica inteligente
        const position = await obtenerUbicacionRobusta();

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

        notificar("📍 Parada registrada", "info");

    } catch (e) {
        console.error(e);
        notificar("❌ No se pudo registrar la parada. Verifica tu GPS.", "error");
    } finally {
        const btn = document.getElementById('btnParada');
        if(btn) btn.disabled = false;
    }
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
                // JUSTO DESPUÉS DE QUE EL SERVIDOR RESPONDE OK:
                notificar("🏁 Carrera finalizada. Calculando cobro...", "exito");
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
                notificar("❌ Error al finalizar carrera: " + resultado.message, "error");
                btnCobrar.disabled = false;
                btnCobrar.innerHTML = textoBtn;
                btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
            }

        } catch (error) {
            console.error(error);
            notificar("❌ Error de conexión", "error");
            btnCobrar.disabled = false;
        }
    }, (err) => {
        // Si falla el GPS final, guardamos igual con lat 0 (Para no trabarte)
        console.warn("GPS falló al cerrar, guardando sin coords fin");
        // ... (Podrías repetir la lógica de fetch aquí, pero para simplificar dejamos que intente de nuevo)
        notificar("GPS Lento: Intenta de nuevo (Acércate a la ventana)", "info");
        btnCobrar.disabled = false;
        btnCobrar.innerHTML = textoBtn;
        btnCobrar.className = 'btn btn-success w-100 btn-lg fw-bold';
    }, opcionesGPS);
}

// --- CARGA DE DATOS ---

// 1. ACTUALIZAR TARJETA Y FRASES
async function cargarResumenDia() {
    try {
        const response = await fetch(`${API_URL}/resumen`);
        const result = await response.json();

        if (result.success) {
            const total = parseFloat(result.total);
            const meta = parseFloat(result.meta) || 200; // 200 si es 0

            // Actualizar Montos
            document.getElementById('lblTotalDia').innerText = total.toFixed(2);
            document.getElementById('lblMetaNum').innerText = `Meta: S/ ${meta.toFixed(0)}`;

            // Calcular Porcentaje
            let porcentaje = (total / meta) * 100;
            if (porcentaje > 100) porcentaje = 100; // Tope visual

            // Actualizar Barra y Badge
            const barra = document.getElementById('barraMeta');
            barra.style.width = `${porcentaje}%`;
            document.getElementById('lblPorcentaje').innerText = `${(total/meta*100).toFixed(0)}%`;

            // --- LÓGICA DE FRASES MOTIVACIONALES ---
            const lblFrase = document.getElementById('lblFrase');
            
            // Reiniciar colores
            barra.className = 'progress-bar progress-bar-striped progress-bar-animated';
            
            if (porcentaje < 10) {
                barra.classList.add('bg-danger');
                lblFrase.innerText = "¡Arrancamos motores! 🚦";
                lblFrase.className = "text-muted small fst-italic";
            } else if (porcentaje < 40) {
                barra.classList.add('bg-warning');
                lblFrase.innerText = "¡Buen ritmo, sigue así! 🚕";
                lblFrase.className = "text-white small fw-bold";
            } else if (porcentaje < 75) {
                barra.classList.add('bg-info');
                lblFrase.innerText = "¡Ya pasamos la mitad! 💪";
                lblFrase.className = "text-info small fw-bold";
            } else if (porcentaje < 100) {
                barra.classList.add('bg-primary');
                lblFrase.innerText = "¡La meta está cerca! 🔥";
                lblFrase.className = "text-warning small fw-bold";
            } else {
                barra.classList.add('bg-success');
                lblFrase.innerText = "¡ERES UNA MÁQUINA! 🏆";
                lblFrase.className = "text-success small fw-bold text-uppercase";
                document.getElementById('lblPorcentaje').classList.replace('bg-dark', 'bg-success');
                document.getElementById('lblPorcentaje').classList.add('text-white');
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

            // Cálculos
            let porcentaje = (gananciaHoy / meta) * 100;
            if (porcentaje > 100) porcentaje = 100;
            if (porcentaje < 0) porcentaje = 0;

            // --- AQUÍ ESTABA EL ERROR: ACTUALIZAMOS LOS IDs ---

            // 1. El número grande (Ganancia Hoy)
            const elTotal = document.getElementById('lblTotalDia');
            if (elTotal) elTotal.innerText = gananciaHoy.toFixed(2);

            // 2. La etiqueta pequeña de la meta (Abajo a la izquierda)
            const elMetaNum = document.getElementById('lblMetaNum');
            if (elMetaNum) elMetaNum.innerText = `Meta: S/ ${meta}`;

            // 3. El Badge del porcentaje (Arriba a la derecha)
            const elPorc = document.getElementById('lblPorcentaje');
            if (elPorc) elPorc.innerText = `${porcentaje.toFixed(0)}%`;
            
            // 4. La Barra de Progreso
            const barra = document.getElementById('barraMeta');
            if (barra) {
                barra.style.width = `${porcentaje}%`;
                barra.className = 'progress-bar progress-bar-striped progress-bar-animated fw-bold';
                
                // Colores de la barra según progreso
                if (porcentaje < 20) barra.classList.add('bg-warning', 'text-dark');
                else if (porcentaje < 80) barra.classList.add('bg-info', 'text-dark');
                else barra.classList.add('bg-success');
            }

            // 5. La Frase Motivacional (Abajo a la derecha)
            const frase = document.getElementById('lblFrase');
            if (frase) {
                if (porcentaje < 20) frase.innerText = "☕ Arrancando motores...";
                else if (porcentaje < 50) frase.innerText = "🚕 Vamos sumando.";
                else if (porcentaje < 80) frase.innerText = "🔥 ¡Ya casi llegas!";
                else frase.innerText = "🎉 ¡META CUMPLIDA!";
            }
        }
    } catch (error) { 
        console.error("Error meta:", error); 
    }
}

// 2. FUNCIÓN PARA CAMBIAR LA META (CLICK EN LA TARJETA)
async function cambiarMeta() {
    // Obtenemos la meta actual del texto para ponerla en el prompt
    const textoActual = document.getElementById('lblMetaNum').innerText.replace('Meta: S/ ', '');
    
    const nuevaMeta = prompt("🎯 DEFINIR OBJETIVO DE HOY\n\n¿Cuánto quieres ganar hoy?", textoActual);
    
    if (nuevaMeta && !isNaN(nuevaMeta) && nuevaMeta > 0) {
        try {
            const response = await fetch(`${API_URL}/meta`, { // Ruta simplificada
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meta: nuevaMeta })
            });
            
            const res = await response.json();
            if (res.success) {
                // Recargamos la tarjeta para ver el cambio y la nueva frase
                cargarResumenDia();
                // Feedback sutil
                const cardBody = document.querySelector('.card-body');
                cardBody.style.backgroundColor = '#2ecc71';
                setTimeout(() => cardBody.style.backgroundColor = '', 300);
            }
        } catch (e) {
            notificar("Error al guardar meta", "error");
        }
    }
}

// --- GASTOS Y TRANSFERENCIAS ---

async function guardarGasto() {
    const monto = document.getElementById('montoGasto').value;
    let descripcion = document.getElementById('descGasto').value;
    const cuentaId = document.getElementById('cuentaGasto').value;
    
    // 1. OBTENER CATEGORÍA SELECCIONADA (Radio Button)
    const categoriaSeleccionada = document.querySelector('input[name="catGasto"]:checked').value;

    if (!monto) {
        notificar("Ingresa el monto", "info");
        return;
    }

    // Si no puso descripción, usamos la categoría por defecto (Ej: "Combustible")
    if (!descripcion) {
        descripcion = categoriaSeleccionada; 
    }

    try {
        const response = await fetch(`${API_URL}/gastos`, { // Ruta simplificada
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                monto, 
                descripcion, 
                cuenta_id: cuentaId,
                categoria: categoriaSeleccionada // ENVIAMOS LA NUEVA DATA
            })
        });

        const result = await response.json();

        if (result.success) {
            // Limpiar y cerrar
            document.getElementById('montoGasto').value = '';
            document.getElementById('descGasto').value = '';
            
            // Cerrar modal correctamente con Bootstrap 5
            const modalEl = document.getElementById('modalGasto');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();

            // Actualizar interfaz
            cargarResumenDia(); // Para que baje el neto si tienes esa lógica
            cargarHistorial();  // Por si mostramos gastos ahí
            notificar(`✅ Gasto de ${categoriaSeleccionada} registrado.`, "exito");
        } else {
            notificar("Error: " + result.error, "error");
        }
    } catch (e) {
        console.error(e);
        notificar("Error de conexión", "error");
    }
}

// ABRIR MODAL TRANSFERENCIA (CON CHULETA DE REPARTO)
async function abrirModalTransferencia(datosReparto = null) {
    
    // 1. Cerrar otros modales para evitar conflictos
    const modalBilletera = bootstrap.Modal.getInstance(document.getElementById('modalBilletera'));
    if (modalBilletera) modalBilletera.hide();

    const modalCierre = bootstrap.Modal.getInstance(document.getElementById('modalCierreCaja'));
    if (modalCierre) modalCierre.hide();

    // 2. Configurar la "Chuleta" (Panel de Recordatorio)
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

    // 3. Abrir Modal
    const modalTrans = new bootstrap.Modal(document.getElementById('modalTransferencia'));
    modalTrans.show();

    // 4. Llenar Selects (CON EL NOMBRE CORREGIDO)
    const cuentas = [
        {id: 1, nombre: '💵 Efectivo (Bolsillo)'},
        {id: 2, nombre: '🟣 Yape / BCP'},
        {id: 3, nombre: '💰 Warda - Arca Oro'},
        {id: 4, nombre: '🛠️ Warda - Taller'},
        {id: 5, nombre: '📉 Warda - Deuda 8k'},
        {id: 6, nombre: '🎓 Warda - Sueldo'} // <-- CAMBIO REALIZADO AQUÍ
    ];
    
    const selectOrigen = document.getElementById('selectOrigen');
    const selectDestino = document.getElementById('selectDestino');
    let html = '';
    cuentas.forEach(c => html += `<option value="${c.id}">${c.nombre}</option>`);
    
    selectOrigen.innerHTML = html;
    selectDestino.innerHTML = html;
    
    // Configuración inicial inteligente
    if (datosReparto) {
        selectOrigen.value = 1; 
        selectDestino.value = 6; // Sugerir ir a Sueldo primero
    } else {
        selectOrigen.value = 1;
        selectDestino.value = 3;
    }

    // 5. OBTENER SALDOS REALES (CON LA RUTA CORREGIDA)
    const lblSaldo = document.getElementById('lblSaldoDisponible');
    lblSaldo.innerText = "Consultando...";
    lblSaldo.className = "fw-bold text-muted";

    try {
        // Hacemos la petición a la nueva ruta que creamos
        const res = await fetch(`${API_URL}/finanzas/cuentas`);
        const result = await res.json();
        
        if (result.success) {
            // Guardamos los saldos en caché: { "1": 150.00, "2": 50.00 ... }
            saldosCache = {};
            result.data.forEach(c => {
                saldosCache[c.id] = parseFloat(c.saldo_actual);
            });
            
            // Actualizamos visualmente el saldo ahora mismo
            actualizarSaldoOrigen();
        } else {
             lblSaldo.innerText = "Error datos";
        }
    } catch (e) {
        console.error("Error cargando saldos:", e);
        lblSaldo.innerText = "--";
    }
}

// 6. FUNCIÓN AUXILIAR PARA MOSTRAR EL SALDO AL CAMBIAR EL SELECT
function actualizarSaldoOrigen() {
    const idOrigen = document.getElementById('selectOrigen').value;
    const lblSaldo = document.getElementById('lblSaldoDisponible');
    
    // Verificamos si tenemos el dato en caché
    if (saldosCache && saldosCache[idOrigen] !== undefined) {
        const saldo = saldosCache[idOrigen];
        lblSaldo.innerText = `S/ ${saldo.toFixed(2)}`;
        
        // Colores semáforo
        if (saldo < 10) lblSaldo.className = "fw-bold text-danger";
        else lblSaldo.className = "fw-bold text-success";
        
    } else {
        // Si no hay datos cargados todavía
        lblSaldo.innerText = "--";
    }
}

// FUNCIÓN PUENTE: Captura los datos del Cierre y abre Transferencias
function irATransferirConDatos() {
    // 1. Leemos los montos que ya calculamos y están en pantalla
    const sueldo = document.getElementById('sugPersonal').innerText;
    const arca = document.getElementById('sugArca').innerText;
    const deuda = document.getElementById('detDeuda').innerText;
    const taller = document.getElementById('detTaller').innerText;

    // 2. Creamos el paquetito de datos
    const datos = {
        sueldo: sueldo,
        arca: arca,
        deuda: deuda,
        taller: taller
    };

    // 3. Abrimos el modal pasando el paquete
    abrirModalTransferencia(datos);
}

// ==========================================
// MÓDULO CIERRE DE CAJA (V3: LÓGICA DE GANANCIA REAL)
// ==========================================

let sysEfe = 0, sysYape = 0;
let ingresosHoyBD = 0, gastosHoyBD = 0;
let difEfe = 0, difYape = 0;

async function abrirCierreCaja() {
    const modal = new bootstrap.Modal(document.getElementById('modalCierreCaja'));
    
    // Reset visual
    document.getElementById('paso1_conteo').classList.remove('d-none');
    document.getElementById('paso2_resultado').classList.add('d-none');
    document.getElementById('paso3_reparto').classList.add('d-none');
    document.getElementById('inputRealEfectivo').value = '';
    document.getElementById('inputRealYape').value = '';

    modal.show();

    try {
        const res = await fetch(`${API_URL}/finanzas/cierre-datos`);
        const result = await res.json();
        
        if(result.success) {
            sysEfe = parseFloat(result.saldo_efectivo);
            sysYape = parseFloat(result.saldo_yape);
            
            // Guardamos esto para calcular la "Base de Ayer"
            ingresosHoyBD = parseFloat(result.ingresos_hoy) || 0;
            gastosHoyBD = parseFloat(result.gastos_hoy) || 0;
            
            document.getElementById('lblSysEfectivo').innerText = sysEfe.toFixed(2);
            document.getElementById('lblSysYape').innerText = sysYape.toFixed(2);
        }
    } catch(e) {
        notificar("Error obteniendo datos", "error");
    }
}

function verificarCierre() {
    const inEfe = document.getElementById('inputRealEfectivo').value;
    const inYape = document.getElementById('inputRealYape').value;

    if(inEfe === '' || inYape === '') return notificar("Completa ambos montos (0 si vacío)", "error");

    const realEfe = parseFloat(inEfe);
    const realYape = parseFloat(inYape);

    difEfe = realEfe - sysEfe;
    difYape = realYape - sysYape;
    const difTotal = difEfe + difYape;

    // Vista Resultado
    document.getElementById('paso1_conteo').classList.add('d-none');
    document.getElementById('paso2_resultado').classList.remove('d-none');

    const icono = document.getElementById('iconoResultado');
    const titulo = document.getElementById('tituloResultado');
    const mensaje = document.getElementById('mensajeResultado');

    if (Math.abs(difTotal) < 1) {
        icono.innerHTML = "✅";
        titulo.className = "fw-bold mb-2 text-success";
        titulo.innerText = "¡Caja Cuadrada!";
        mensaje.innerText = "Todo coincide perfectamente.";
    } else if (difTotal < 0) {
        icono.innerHTML = "⚠️";
        titulo.className = "fw-bold mb-2 text-danger";
        titulo.innerText = "Falta Dinero";
        mensaje.innerText = `Falta S/ ${Math.abs(difTotal).toFixed(2)}. Se ajustará como gasto.`;
    } else {
        icono.innerHTML = "🤑";
        titulo.className = "fw-bold mb-2 text-info";
        titulo.innerText = "Sobra Dinero";
        mensaje.innerText = `Sobran S/ ${difTotal.toFixed(2)}. Se ajustará como ingreso.`;
    }
}

async function procesarAjusteYReparto() {
    
    // --- FUNCIÓN AUXILIAR DE SEGURIDAD ---
    // Esto evita que la app se rompa si falta un ID en el HTML
    const safeText = (id, valor) => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.innerText = valor;
        } else {
            console.error(`❌ ERROR CRÍTICO: Falta el ID "${id}" en tu index.html`);
        }
    };

    // 1. Registrar Ajuste en BD si es necesario
    if (difEfe !== 0) {
        try {
            await fetch(`${API_URL}/finanzas/cierre-ajuste`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ diferencia: difEfe }) 
            });
        } catch(e) {}
    }

    // 2. DATOS REALES
    const realEfe = parseFloat(document.getElementById('inputRealEfectivo').value) || 0;
    const realYape = parseFloat(document.getElementById('inputRealYape').value) || 0;
    const totalEnMano = realEfe + realYape;

    // 3. BASE DE AYER (Ingresos Hoy - Gastos Hoy)
    // El saldo del sistema ajustado, menos lo que se movió hoy, nos da con cuánto empezamos
    const saldoSistemaTotal = sysEfe + sysYape + difEfe + difYape; 
    const baseAyer = saldoSistemaTotal - ingresosHoyBD + gastosHoyBD;

    // 4. GANANCIA REAL
    let gananciaHoy = totalEnMano - baseAyer;
    if (gananciaHoy < 0) gananciaHoy = 0; 

    // 5. ESTRATEGIA DE REPARTO
    const paraSueldo = gananciaHoy * 0.10; 
    const paraArca   = gananciaHoy * 0.10; 
    const paraNegocio = gananciaHoy * 0.80; 

    // Desglose Negocio
    const costoComida = 40.00; 
    let remanenteNegocio = paraNegocio - costoComida;
    
    let paraDeuda = 0, paraTaller = 0, paraGasolina = 0;

    if (remanenteNegocio > 0) {
        paraDeuda = remanenteNegocio * 0.40;
        paraTaller = remanenteNegocio * 0.20;
        paraGasolina = remanenteNegocio * 0.40; 
    } else {
        paraGasolina = 0;
    }

    // 6. PINTAR DATOS (USANDO safeText PARA EVITAR ERRORES)
    safeText('resTotalMano', `S/ ${totalEnMano.toFixed(2)}`);
    safeText('resBaseAyer', `S/ ${baseAyer.toFixed(2)}`);
    safeText('resGananciaHoy', `S/ ${gananciaHoy.toFixed(2)}`);
    
    // AQUÍ FALLABA ANTES, AHORA NO SE ROMPERÁ
    safeText('montoFinalReparto', `S/ ${gananciaHoy.toFixed(2)}`);

    // Cajas
    safeText('sugPersonal', `S/ ${paraSueldo.toFixed(2)}`);
    safeText('sugArca', `S/ ${paraArca.toFixed(2)}`);
    safeText('sugNegocioTotal', `S/ ${paraNegocio.toFixed(2)}`);

    // Detalles
    safeText('detComida', `S/ ${costoComida.toFixed(2)}`);
    safeText('detDeuda', `S/ ${paraDeuda.toFixed(2)}`);
    safeText('detTaller', `S/ ${paraTaller.toFixed(2)}`);
    safeText('detGasolina', `S/ ${paraGasolina.toFixed(2)}`);

    // 7. SALDO FINAL REMANENTE
    const saldoFinalBolsillo = baseAyer + paraGasolina;
    safeText('saldoRemanente', `S/ ${saldoFinalBolsillo.toFixed(2)}`);

    // 8. MOSTRAR PANTALLA
    const p2 = document.getElementById('paso2_resultado');
    const p3 = document.getElementById('paso3_reparto');
    
    if (p2 && p3) {
        p2.classList.add('d-none');
        p3.classList.remove('d-none');
    }
}

function reiniciarCierre() {
    document.getElementById('paso1_conteo').classList.remove('d-none');
    document.getElementById('paso2_resultado').classList.add('d-none');
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
            const cuentas = data.cuentas; // Array con todas tus cuentas

            // 1. ASIGNACIÓN EXACTA POR ID (Para que no salga 0.00)
            // Usamos .find() para buscar la cuenta específica por su ID de Base de Datos
            
            // ID 1: Efectivo
            const saldoEfectivo = cuentas.find(c => c.id === 1)?.saldo_actual || 0;
            // ID 2: Yape
            const saldoYape = cuentas.find(c => c.id === 2)?.saldo_actual || 0;
            
            // ID 3: Arca (Ahorro 10%) - Tarjeta Grande
            const saldoArca = cuentas.find(c => c.id === 3)?.saldo_actual || 0;

            // ID 4, 5, 6: Wardas Específicas
            const saldoTaller = cuentas.find(c => c.id === 4)?.saldo_actual || 0;
            const saldoDeuda = cuentas.find(c => c.id === 5)?.saldo_actual || 0;
            const saldoEmergencia = cuentas.find(c => c.id === 6)?.saldo_actual || 0;

            // 2. RENDERIZAR EN EL HTML
            // Dinero Real
            document.getElementById('txtEfectivo').innerText = `S/ ${parseFloat(saldoEfectivo).toFixed(2)}`;
            document.getElementById('txtYape').innerText = `S/ ${parseFloat(saldoYape).toFixed(2)}`;
            
            // El Arca (Tarjeta Grande)
            document.getElementById('txtAhorro').innerText = `S/ ${parseFloat(saldoArca).toFixed(2)}`;

            // Las Wardas (Nueva Sección)
            document.getElementById('txtWardaTaller').innerText = `S/ ${parseFloat(saldoTaller).toFixed(2)}`;
            document.getElementById('txtWardaDeuda').innerText = `S/ ${parseFloat(saldoDeuda).toFixed(2)}`;
            document.getElementById('txtWardaEmergencia').innerText = `S/ ${parseFloat(saldoEmergencia).toFixed(2)}`;

            // Info General
            document.getElementById('txtGastos').innerText = `S/ ${parseFloat(data.gasto_mensual).toFixed(2)}`;

            // --- LLENAR LISTA DE MOVIMIENTOS (Igual que antes) ---
            const divMovimientos = document.getElementById('listaMovimientos');
            if (divMovimientos) {
                if (data.movimientos && data.movimientos.length > 0) {
                    let htmlMovs = '';
                    data.movimientos.forEach(mov => {
                        let icono = 'fa-circle';
                        let color = 'text-white';
                        let signo = '';

                        if (mov.tipo === 'INGRESO') {
                            icono = 'fa-arrow-up'; color = 'text-success'; signo = '+';
                        } else if (mov.tipo === 'GASTO') {
                            icono = 'fa-arrow-down'; color = 'text-danger'; signo = '-';
                        } else if (mov.tipo === 'PAGO_DEUDA') {
                            icono = 'fa-check-double'; color = 'text-info'; signo = '-';
                        } else if (mov.tipo === 'TRANSFERENCIA') {
                            icono = 'fa-exchange-alt'; color = 'text-warning'; signo = ' ';
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
            
            // Gráficos
            dibujarDona(data.estadisticas);
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
    
    // Validamos que stats no sea null
    const datosSeguros = stats || [];

    const labels = datosSeguros.length ? datosSeguros.map(e => e.origen_tipo) : ['Sin datos'];
    const values = datosSeguros.length ? datosSeguros.map(e => parseFloat(e.total)) : [1]; // <--- parseFloat IMPORTANTE
    
    const colors = labels.map(n => {
        if(n === 'INDRIVER') return '#198754'; 
        if(n === 'UBER') return '#f8f9fa';     
        if(n === 'CALLE') return '#ffc107';    
        return '#6c757d';                      
    });

    miGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels, 
            datasets: [{ 
                data: values, 
                backgroundColor: colors, 
                borderWidth: 0 
            }] 
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false, // <--- ESTO AYUDA A QUE NO SE DEFORME
            plugins: { 
                legend: { 
                    position: 'right', 
                    labels: { color: 'white' } 
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            let value = parseFloat(context.parsed); // Aseguramos número
                            
                            // Suma segura de todo el dataset
                            let total = context.dataset.data.reduce((a, b) => a + (parseFloat(b) || 0), 0);
                            
                            // Calculamos porcentaje protegiendo la división por cero
                            let porcentaje = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                            
                            return `${label}: S/ ${value.toFixed(2)} (${porcentaje})`;
                        }
                    }
                }
            } 
        }
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
    const verTodos = document.getElementById('chkVerTodos') ? document.getElementById('chkVerTodos').checked : false;

    // Solo mostramos 'Cargando' si el contenedor está visible, para no molestar visualmente
    if (contenedor && contenedor.offsetParent !== null) {
        contenedor.innerHTML = '<div class="text-center p-3 text-muted"><i class="fas fa-spinner fa-spin"></i> Actualizando...</div>';
    }

    try {
        // --- TRUCO ANTI-CACHÉ ---
        // Agregamos ?t=TIMESTAMP al final. El servidor lo ignora, pero el navegador cree que es una página nueva.
        const urlSinCache = `${API_URL}/obligaciones?t=${new Date().getTime()}`;
        
        const response = await fetch(urlSinCache);
        const result = await response.json();

        // 1. ACTUALIZACIÓN DEL BADGE ROJO (¡LO MÁS IMPORTANTE!)
        const countBadge = document.getElementById('badgeDeudasCount');
        if (countBadge) {
            // Actualizamos el número con la cantidad REAL que viene del servidor
            const cantidad = result.data ? result.data.length : 0;
            countBadge.innerText = cantidad;
            
            // Si es 0, lo ocultamos; si hay deudas, lo mostramos
            countBadge.style.display = cantidad > 0 ? 'inline-block' : 'none';
            
            console.log("🔴 Badge actualizado a:", cantidad); // MIRA LA CONSOLA (F12) PARA CONFIRMAR
        }

        // 2. RENDERIZADO DE LA LISTA (Igual que antes)
        if (result.success && result.data.length > 0) {
            let html = '';
            let contratosMostrados = {}; 
            
            // Ordenamos
            const listaOrdenada = result.data.sort((a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento));
            
            let contadorOcultos = 0;

            listaOrdenada.forEach(item => {
                const fechaObj = new Date(item.fecha_vencimiento);
                const userTimezoneOffset = fechaObj.getTimezoneOffset() * 60000;
                const fechaAjustada = new Date(fechaObj.getTime() + userTimezoneOffset);
                const fechaBonita = fechaAjustada.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const dias = parseInt(item.dias_restantes);

                let mostrar = true;

                if (!verTodos) {
                    if (item.compromiso_id) {
                        if (dias >= 0) { 
                            if (contratosMostrados[item.compromiso_id]) {
                                mostrar = false;
                                contadorOcultos++;
                            } else {
                                contratosMostrados[item.compromiso_id] = true;
                            }
                        }
                    }
                }

                if (!mostrar) return;

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
                
                if (dias < 0) {
                    bordeColor = 'border-danger border-start border-4';
                    badgeEstado = `<span class="badge bg-danger w-100 mb-1">¡VENCIDO HACE ${Math.abs(dias)} DÍAS!</span>`;
                }

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

            if (contadorOcultos > 0) {
                html += `<div class="text-center text-muted small mt-2 fst-italic">Hay ${contadorOcultos} cuotas futuras ocultas.</div>`;
            }

            if(contenedor) contenedor.innerHTML = html;

        } else {
            if(contenedor) contenedor.innerHTML = '<div class="text-center p-5 text-muted"><i class="fas fa-check-circle fa-2x mb-3 text-success"></i><br>¡Todo pagado! Eres libre.</div>';
        }
    } catch (e) {
        console.error(e);
        if(contenedor) contenedor.innerHTML = '<div class="text-danger p-3 text-center">Error al cargar datos</div>';
    }
}

async function crearObligacion() {
    const titulo = document.getElementById('nuevaObliTitulo').value;
    const monto = document.getElementById('nuevaObliMonto').value;
    const fecha = document.getElementById('nuevaObliFecha').value;
    const prioridad = document.getElementById('nuevaObliPrioridad').value;

    if (!titulo || !monto || !fecha) {
        notificar("⚠️ Por favor completa Título, Monto y Fecha.", "error");
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
            notificar("✅ Gasto registrado correctamente", "exito");
        } else {
            // Error del Servidor
            notificar("❌ Error al guardar: " + (result.message || "Error desconocido"), "error");
        }

    } catch (e) { 
        console.error(e);
        notificar("❌ Error de Conexión: Verifica tu internet o el servidor.", "error"); 
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = textoOriginal;
    }
}

// NUEVO: CREAR PRÉSTAMO GRANDE (COMPROMISO)
async function crearPrestamo() {
    const titulo = document.getElementById('presTitulo').value;
    const montoStr = document.getElementById('presMonto').value;
    const diaStr = document.getElementById('presDia').value;
    
    // Detectar Tipo
    const esServicio = document.getElementById('tipoServicio').checked;
    const tipo = esServicio ? 'SERVICIO_FIJO' : 'PRESTAMO';
    
    // Si es servicio, forzamos 12 cuotas
    let cuotasStr = document.getElementById('presCuotas').value;
    if (esServicio) cuotasStr = "12"; 

    if (!titulo || !montoStr || !cuotasStr || !diaStr) {
        notificar("Completa todos los datos del contrato", "error");
        return;
    }

    // CONVERSIÓN A NÚMEROS (Vital para evitar errores)
    const monto = parseFloat(montoStr);
    const cuotas = parseInt(cuotasStr);
    const dia = parseInt(diaStr);

    // CÁLCULO DE MONTO TOTAL
    // Si es Servicio, proyectamos el costo de 1 año (monto * 12) para que no vaya en 0
    const montoTotal = monto * cuotas;

    if(confirm(`¿Generar cronograma para "${titulo}"?\nTipo: ${tipo}\nMonto Mensual: S/ ${monto}\nInicio: Día ${dia}`)) {
        
        try {
            const res = await fetch(`${API_URL}/compromisos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo: titulo, 
                    tipo: tipo, 
                    monto_total: montoTotal,   // Ahora siempre envía valor > 0
                    monto_cuota: monto, 
                    cuotas_totales: cuotas,
                    dia_pago: dia,
                    warda_origen_id: null      // Enviamos null explícito para evitar undefined
                })
            });
            const data = await res.json();
            
            if(data.success) {
                notificar("✅ Cronograma generado correctamente", "exito");
                // Limpiar formulario
                document.getElementById('presTitulo').value = '';
                document.getElementById('presMonto').value = '';
                // Recargar lista
                cargarObligaciones();
            } else {
                notificar("❌ Error al guardar: " + data.message, "error");
            }
        } catch (e) {
            console.error(e);
            notificar("❌ Error de Conexión", "error");
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
            notificar("✅ Pagado","exito");
            cargarObligaciones();
        } else notificar("❌ Error al pagar: " + data.message,"error");
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
            notificar("Error cargando ruta","error");
        }
    } catch (e) {
        console.error(e);
        notificar("Error de conexión","error");
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

// ==========================================
// MÓDULO DE MI AUTO
// ==========================================

// 1. OBTENER ESTADO DEL AUTO (GET)
async function cargarEstadoVehiculo() {
    try {
        const res = await fetch(`${API_URL}/vehiculo`); 
        const result = await res.json();

        if (result.success) {
            const d = result.data;
            
            // 1. MECÁNICA (Esto sigue igual)
            document.getElementById('lblOdometro').innerText = d.odometro.toLocaleString();
            document.getElementById('lblProximoCambio').innerText = d.proximo_cambio.toLocaleString();
            
            const barra = document.getElementById('barraAceite');
            const alerta = document.getElementById('lblAlertaAceite');
            
            document.getElementById('lblPorcentajeAceite').innerText = d.porcentaje_vida.toFixed(0) + '%';
            barra.style.width = `${d.porcentaje_vida}%`;

            barra.className = 'progress-bar progress-bar-striped progress-bar-animated'; 
            if (d.porcentaje_vida > 50) {
                barra.classList.add('bg-success'); alerta.style.display = 'none';
            } else if (d.porcentaje_vida > 20) {
                barra.classList.add('bg-warning', 'text-dark'); alerta.style.display = 'none';
            } else {
                barra.classList.add('bg-danger'); alerta.style.display = 'block';
            }

            // 2. LEGAL (NUEVO: Llamamos a la función semáforo)
            analizarDocumento('Soat', d.fecha_soat);
            analizarDocumento('Revision', d.fecha_revision);
            analizarDocumento('Gnv', d.fecha_gnv);
        }
    } catch (e) {
        console.error("Error cargando vehículo:", e);
    }
}

// 2. ACTUALIZAR KILOMETRAJE (POST)
async function actualizarOdometro() {
    // Leemos el valor actual del HTML y quitamos las comas para que sea número
    const actualTexto = document.getElementById('lblOdometro').innerText.replace(/,/g, '');
    const actual = parseInt(actualTexto) || 0;

    // Pedimos el dato al usuario
    const nuevo = prompt(`🚗 ACTUALIZAR TABLERO\n\nEl tablero marca actualmente: ${actual} km\n\n¿Qué dice hoy tu tablero?`, actual);

    if (nuevo && !isNaN(nuevo)) {
        const nuevoKm = parseInt(nuevo);

        // Validación simple frontend
        if (nuevoKm < actual) {
            notificar("❌ Error: No puedes poner un kilometraje menor al actual (el auto no viaja al pasado).","error");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/vehiculo/actualizar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevo_km: nuevoKm })
            });
            const result = await res.json();

            if (result.success) {
                // Éxito: Mostramos cuánto recorrió hoy
                notificar(`✅ ¡Actualizado!\n\nRecorrido registrado hoy: ${result.recorrido_hoy} km`, "exito");
                cargarEstadoVehiculo(); // Recargamos la barra visualmente
            } else {
                notificar("❌ Error al actualizar: " + result.message,"error");
            }
        } catch (e) {
            notificar("Error de conexión con el servidor.","error");
        }
    }    
}

// 3. REGISTRAR MANTENIMIENTO (VERSIÓN 2.0 - COMBO COMPLETO)
async function registrarMantenimiento() {
    // 1. Confirmación de seguridad
    if (!confirm("⚠️ ¿Confirmas que REALIZASTE el cambio de aceite hoy?\n\nEsto actualizará tu tablero y reiniciará la vida del aceite.")) {
        return;
    }

    // 2. Pregunta 1: Kilometraje ACTUAL (Para calibrar exacto)
    // Obtenemos el valor actual solo como sugerencia visual
    const actualTexto = document.getElementById('lblOdometro').innerText.replace(/,/g, '');
    const sugerencia = parseInt(actualTexto) || 0;

    const nuevoKmInput = prompt("1️⃣ PASO 1:\nIngresa el KILOMETRAJE EXACTO de tu tablero ahora mismo:", sugerencia);
    
    if (!nuevoKmInput || isNaN(nuevoKmInput)) return; // Si cancela, salimos
    const nuevoKm = parseInt(nuevoKmInput);

    // 3. Pregunta 2: Intervalo
    const intervaloInput = prompt("2️⃣ PASO 2:\n¿Cada cuántos Km haces el cambio?", "5000");
    if (!intervaloInput || isNaN(intervaloInput)) return;
    const intervalo = parseInt(intervaloInput);

    // 4. Enviamos TODO al servidor
    try {
        const res = await fetch(`${API_URL}/vehiculo/mantenimiento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                nuevo_km: nuevoKm,      // Dato 1
                intervalo_km: intervalo // Dato 2
            })
        });
        
        const result = await res.json();

        if (result.success) {
            notificar("✅ " + result.message,"exito");
            cargarEstadoVehiculo(); // Recargar todo (Barra verde y Km actualizado)
        } else {
            notificar("❌ Error al registrar: " + result.message,"error");
        }
    } catch (e) {
        console.error(e);
        notificar("Error de conexión con el servidor.","error");
    }
}

// --- FUNCIONES AUXILIARES DE DOCUMENTOS ---

// Semáforo de colores para fechas
// OBSERVACIÓN 3: Corrección de fechas "Invalid Date"
function analizarDocumento(tipo, fechaBruta) {
    const badge = document.getElementById(`badge${tipo}`);
    const lblFecha = document.getElementById(`fecha${tipo}`);
    
    // 1. Si no hay datos, mostramos estado neutro
    if (!fechaBruta) {
        badge.className = 'badge bg-secondary rounded-pill px-3';
        badge.innerText = 'Sin Dato';
        lblFecha.innerText = '--/--/----';
        return;
    }

    try {
        // 2. Limpieza de fecha: 
        // La BD puede mandar "2026-05-20" o "2026-05-20T05:00:00.000Z"
        // Nos aseguramos de quedarnos solo con la parte YYYY-MM-DD
        let fechaString = fechaBruta;
        if (typeof fechaBruta === 'string' && fechaBruta.includes('T')) {
            fechaString = fechaBruta.split('T')[0];
        }

        // 3. Crear fecha de vencimiento asegurando zona horaria local
        // Truco: Usamos split y constructor directo para evitar líos de UTC (-5h)
        const partes = fechaString.split('-'); // [2026, 05, 20]
        // OJO: Mes en JS empieza en 0 (Enero=0, Mayo=4)
        const vencimiento = new Date(partes[0], partes[1] - 1, partes[2]);
        
        const hoy = new Date();
        // Ponemos "hoy" a las 00:00:00 para comparar peras con peras
        hoy.setHours(0,0,0,0); 

        // 4. Calcular diferencia en días
        const diffTime = vencimiento - hoy;
        const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 5. Mostrar fecha bonita
        lblFecha.innerText = vencimiento.toLocaleDateString('es-PE', { 
            year: 'numeric', month: 'long', day: 'numeric' 
        });

        // 6. Semáforo
        if (diasRestantes < 0) {
            badge.className = 'badge bg-danger animate__animated animate__flash infinite rounded-pill px-3'; 
            badge.innerText = `¡VENCIDO!`;
        } else if (diasRestantes < 7) {
            badge.className = 'badge bg-danger rounded-pill px-3';
            badge.innerText = `Vence en ${diasRestantes} días`;
        } else if (diasRestantes < 30) {
            badge.className = 'badge bg-warning text-dark rounded-pill px-3';
            badge.innerText = `Quedan ${diasRestantes} días`;
        } else {
            badge.className = 'badge bg-success rounded-pill px-3';
            badge.innerText = 'Vigente';
        }

    } catch (e) {
        console.error("Error parseando fecha:", e);
        badge.innerText = "Error Fecha";
    }
}

// Abrir modal y cargar datos actuales
async function configurarAuto() {
    try {
        const res = await fetch(`${API_URL}/vehiculo`);
        const result = await res.json();
        if(result.success) {
            const d = result.data;
            if(d.fecha_soat) document.getElementById('inputSoat').value = d.fecha_soat.split('T')[0];
            if(d.fecha_revision) document.getElementById('inputRevision').value = d.fecha_revision.split('T')[0];
            if(d.fecha_gnv) document.getElementById('inputGnv').value = d.fecha_gnv.split('T')[0];
        }
    } catch(e) {}
    
    const modal = new bootstrap.Modal(document.getElementById('modalConfigAuto'));
    modal.show();
}

// Guardar cambios
async function guardarDocumentos() {
    const data = {
        fecha_soat: document.getElementById('inputSoat').value,
        fecha_revision: document.getElementById('inputRevision').value,
        fecha_gnv: document.getElementById('inputGnv').value
    };

    try {
        const res = await fetch(`${API_URL}/vehiculo/documentos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();

        if (result.success) {
            notificar("✅ Documentos actualizados", "exito");
            cargarEstadoVehiculo(); 
            bootstrap.Modal.getInstance(document.getElementById('modalConfigAuto')).hide();
        } else {
            notificar("Error al guardar", "error");
        }
    } catch (e) {
        notificar("Error de conexión", "error");
    }
}

// ==========================================
// MÓDULO DE ESTADÍSTICAS AVANZADAS
// ==========================================

// 1. Abre el modal y carga el filtro por defecto
function abrirEstadisticas() {
    const modal = new bootstrap.Modal(document.getElementById('modalEstadisticas'));
    modal.show();
    
    // Inicia mostrando el Mes Actual automáticamente
    filtrarEstadisticas('mes'); 
}

// 2. Lógica para calcular fechas según el botón presionado
function filtrarEstadisticas(rango) {
    const hoy = new Date();
    let inicio = new Date();
    let fin = new Date(); // Por defecto es hoy

    // Limpieza visual: Quitar color a todos los botones
    document.querySelectorAll('#modalEstadisticas .btn').forEach(b => {
        b.classList.remove('active', 'btn-outline-info');
        // Si no es el botón de la lupa, lo ponemos gris
        if(!b.classList.contains('btn-info')) b.classList.add('btn-outline-light');
    });

    // Matemática de fechas
    switch(rango) {
        case 'hoy':
            // Inicio y Fin son hoy. No hacemos nada.
            break;
        case 'ayer':
            inicio.setDate(hoy.getDate() - 1);
            fin.setDate(hoy.getDate() - 1);
            break;
        case 'semana':
            inicio.setDate(hoy.getDate() - 7);
            break;
        case 'mes': 
            // Primer día del mes actual
            inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            break;
        case '3meses':
            inicio.setMonth(hoy.getMonth() - 3);
            break;
        case 'anio': 
            // 1 de Enero del año actual
            inicio = new Date(hoy.getFullYear(), 0, 1);
            break;
    }

    // Convertir a texto YYYY-MM-DD para MySQL
    // (Ajustamos -5 horas para Perú para evitar problemas de zona horaria UTC)
    const offsetPeru = 5 * 60 * 60 * 1000; 
    const desdeStr = new Date(inicio.getTime() - offsetPeru).toISOString().split('T')[0];
    const hastaStr = new Date(fin.getTime() - offsetPeru).toISOString().split('T')[0];

    // Llenar los inputs visuales
    document.getElementById('filtroDesde').value = desdeStr;
    document.getElementById('filtroHasta').value = hastaStr;
    
    // Texto informativo
    const textos = {'hoy': 'Hoy', 'ayer': 'Ayer', 'semana': 'Últimos 7 Días', 'mes': 'Mes Actual', '3meses': 'Último Trimestre', 'anio': 'Este Año'};
    document.getElementById('lblRangoInfo').innerText = `Viendo: ${textos[rango] || rango}`;

    // Pedir datos al servidor
    cargarDatosGrafico(desdeStr, hastaStr);
}

// 3. Cuando usas la lupa (Rango manual)
function aplicarFiltroManual() {
    const desde = document.getElementById('filtroDesde').value;
    const hasta = document.getElementById('filtroHasta').value;
    
    if(!desde || !hasta) return notificar("Selecciona ambas fechas", "error");
    
    document.getElementById('lblRangoInfo').innerText = `Rango: ${desde} al ${hasta}`;
    cargarDatosGrafico(desde, hasta);
}

// 4. Petición al Servidor (ASYNC porque espera respuesta)
async function cargarDatosGrafico(desde, hasta) {
    try {
        // CORRECCIÓN: Usamos API_URL directa (que suele ser /api/viajes)
        // La ruta final será: /api/viajes/finanzas/grafico-gastos
        const urlFinal = `${API_URL}/finanzas/grafico-gastos?desde=${desde}&hasta=${hasta}`;

        console.log("📡 Pidiendo datos a:", urlFinal); // Esto te ayudará a ver la ruta en la consola

        const response = await fetch(urlFinal);
        
        // Si la respuesta no es OK (ej: 404 o 500), lanzamos error manual
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

        const result = await response.json();

        if (result.success) {
            if (result.data.length === 0) {
                notificar("No hay gastos registrados en estas fechas", "info");
            }
            renderizarGraficoGastos(result.labels, result.data);
        } else {
            throw new Error(result.message || "Error desconocido del servidor");
        }
    } catch (e) {
        console.error("❌ Error gráfico:", e);
        notificar("Error cargando estadísticas: " + e.message, "error");
    }
}

// ==========================================
// FUNCIÓN PARA DIBUJAR EL GRÁFICO DE GASTOS
// ==========================================
function renderizarGraficoGastos(etiquetas, valores) {
    const canvas = document.getElementById('graficoGastos');
    
    // Validación de seguridad: si no existe el canvas, no hacemos nada
    if (!canvas) {
        console.error("❌ No encontré el elemento <canvas id='graficoGastos'> en el HTML");
        return;
    }

    const ctx = canvas.getContext('2d');

    // Si ya existe un gráfico previo, lo destruimos para no sobreponer
    if (miGraficoEstadisticas) {
        miGraficoEstadisticas.destroy();
    }

    // Aseguramos que los valores sean números (para evitar NaN)
    const valoresNumericos = valores.map(v => parseFloat(v) || 0);

    const coloresFondo = [
        'rgba(255, 99, 132, 0.7)',  // Rojo
        'rgba(54, 162, 235, 0.7)',  // Azul
        'rgba(255, 206, 86, 0.7)',  // Amarillo
        'rgba(75, 192, 192, 0.7)',  // Verde
        'rgba(153, 102, 255, 0.7)', // Morado
        'rgba(255, 159, 64, 0.7)'   // Naranja
    ];

    miGraficoEstadisticas = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etiquetas, 
            datasets: [{
                label: 'S/ Gastados',
                data: valoresNumericos,
                backgroundColor: coloresFondo,
                borderColor: '#000',
                borderWidth: 1
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false, // CLAVE: Permite que el gráfico se ajuste al div contenedor
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: 'white', font: { size: 10 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            let value = parseFloat(context.parsed);
                            
                            // Calculamos el total para sacar el porcentaje
                            let total = context.dataset.data.reduce((acc, data) => acc + (parseFloat(data) || 0), 0);
                            
                            // Evitamos división por cero
                            let porcentaje = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                            
                            return `${label}: S/ ${value.toFixed(2)} (${porcentaje})`;
                        }
                    }
                }
            }
        }
    });
}

function descargarReporteFinanciero() {
    if(confirm("¿Descargar Reporte de Gastos e Ingresos?")) {
        // Apunta a la nueva ruta que creamos
        window.location.href = `${API_URL}/reporte/finanzas`;
    }
}

// --- GESTIÓN DE CONTRATOS / SUSCRIPCIONES ---

async function abrirModalContratos() {
    // Cerramos el de obligaciones para abrir este encima (o cambias el z-index, pero esto es más limpio)
    bootstrap.Modal.getInstance(document.getElementById('modalObligaciones')).hide();
    
    const modal = new bootstrap.Modal(document.getElementById('modalContratos'));
    modal.show();

    cargarContratos();
}

async function cargarContratos() {
    const contenedor = document.getElementById('listaContratos');
    contenedor.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

    try {
        const res = await fetch(`${API_URL}/compromisos`);
        const result = await res.json();

        if (result.success && result.data.length > 0) {
            let html = '';
            result.data.forEach(c => {
                // Icono según tipo
                let icono = c.tipo === 'SERVICIO_FIJO' ? 'fa-mobile-alt' : 'fa-university';
                
                html += `
                <div class="list-group-item bg-dark text-white p-3 border-secondary d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold text-warning">
                            <i class="fas ${icono} me-2"></i>${c.titulo}
                        </div>
                        <div class="small text-muted">
                            ${c.tipo === 'SERVICIO_FIJO' ? 'Suscripción Mensual' : 'Préstamo a Plazos'}
                        </div>
                        <div class="small text-white">
                            Cuota aprox: <strong>S/ ${parseFloat(c.monto_cuota_aprox).toFixed(2)}</strong>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-outline-danger btn-sm" onclick="darBajaContrato(${c.id}, '${c.titulo}')">
                            <i class="fas fa-ban me-1"></i> Cancelar
                        </button>
                    </div>
                </div>`;
            });
            contenedor.innerHTML = html;
        } else {
            contenedor.innerHTML = '<div class="text-center p-4 text-muted">No tienes contratos activos.</div>';
        }

    } catch (e) {
        console.error(e);
        contenedor.innerHTML = '<div class="text-danger text-center p-3">Error cargando datos</div>';
    }
}

async function darBajaContrato(id, titulo) {
    if (confirm(`⚠️ ¿Estás seguro de cancelar "${titulo}"?\n\nEsto eliminará todas las cuotas futuras de tu lista de pagos.`)) {
        try {
            const res = await fetch(`${API_URL}/compromisos/cancelar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const result = await res.json();

            if (result.success) {
                notificar("✅ " + result.message, "exito");
                // 1. Recargamos la lista visual de contratos (para que desaparezca de este modal)
                cargarContratos(); 

                // 2. ¡AQUÍ ESTÁ LA SOLUCIÓN! 
                // Recargamos las obligaciones para que se actualice el BADGE ROJO del menú principal
                cargarObligaciones();
            } else {
                notificar("Error: " + result.message, "error");
            }
        } catch (e) {
            notificar("Error de conexión", "error");
        }
    }
}

// --- RECUPERACIÓN DE ESTADO ---
async function verificarViajeEnCurso() {
    try {
        const response = await fetch(`${API_URL}/activo`);
        const result = await response.json();

        if (result.success && result.viaje) {
            const v = result.viaje;
            
            // 1. RECUPERAR ID
            viajeActualId = v.id;
            
            // 2. RECUPERAR FECHA Y HORA (Base de Datos nueva: DATETIME)
            // MySQL devuelve algo como: "2026-01-16T14:30:00.000Z"
            viajeInicioTime = new Date(v.fecha_hora_inicio);

            // 3. RECUPERAR COORDENADAS (Vienen del JOIN con ruta_gps_logs)
            if (v.lat_inicio && v.lng_inicio) {
                viajeInicioCoords = { 
                    lat: parseFloat(v.lat_inicio), 
                    lng: parseFloat(v.lng_inicio) 
                };
            }

            console.log("♻️ Sesión recuperada. ID:", viajeActualId);
            
            // 4. RESTAURAR INTERFAZ
            document.getElementById('btnIniciar').classList.add('d-none');
            const selector = document.getElementById('selectorApps');
            if(selector) selector.classList.add('d-none');
            
            document.getElementById('panelEnCarrera').classList.remove('d-none');
            
            // 5. RECALCULAR CRONÓMETRO
            const ahora = new Date();
            // Truco: Si la hora del servidor y tu celular difieren, usamos Math.abs o validamos
            let diffMs = ahora - viajeInicioTime;
            let diffMin = Math.floor(diffMs / 60000);
            
            // Si sale negativo (por error de zona horaria), ponemos 0
            if (diffMin < 0) diffMin = 0; 

            document.getElementById('txtCronometro').innerText = `En curso: Recuperado (${diffMin} min)`;
            
            notificar("🔄 Viaje activo restaurado correctamente", "info");

        } else {
            // Si no hay viaje, mostramos inicio
            mostrarPanelInicio();
        }
    } catch (e) {
        console.error("Error recuperando sesión:", e);
    }
}

// ==========================================
// 6. FUNCIÓN UNIFICADA PARA TRANSFERIR
// ==========================================
async function realizarTransferencia() {
    const origenId = document.getElementById('selectOrigen').value;
    const destinoId = document.getElementById('selectDestino').value;
    const monto = parseFloat(document.getElementById('montoTransferencia').value);
    const nota = document.getElementById('notaTransferencia').value || 'Transferencia App';

    // 1. Validaciones
    if (!monto || monto <= 0) return notificar("Ingresa un monto válido", "error");
    if (origenId === destinoId) return notificar("El origen y destino no pueden ser iguales", "error");

    // Validación de Saldo (Opcional)
    if (saldosCache && saldosCache[origenId] !== undefined) {
        if (monto > saldosCache[origenId]) {
            return notificar("⚠️ Saldo insuficiente en origen", "error");
        }
    }

    // 2. Efecto visual
    const btn = document.querySelector('button[onclick="realizarTransferencia()"]');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    btn.disabled = true;

    try {
        // 3. Enviar a tu ruta existente (/transferir)
        // OJO: Usamos los nombres de variables que tu Backend espera (cuenta_origen_id)
        const response = await fetch(`${API_URL}/transferir`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                cuenta_origen_id: origenId, 
                cuenta_destino_id: destinoId, 
                monto: monto, 
                nota: nota 
            })
        });
        
        const data = await response.json();

        if (data.success) {
            notificar("✅ Transferencia realizada con éxito", "success");
            
            // Cerrar modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalTransferencia'));
            modal.hide();

            // Limpiar campos
            document.getElementById('montoTransferencia').value = '';
            document.getElementById('notaTransferencia').value = '';

            // IMPORTANTE: Actualizar saldos si estamos en el dashboard
            if (typeof cargarResumenDia === 'function') cargarResumenDia();

        } else {
            notificar(data.message || "Error al transferir", "error");
        }

    } catch (e) {
        console.error(e);
        notificar("Error de conexión", "error");
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

// ==========================================
// 7. CARGAR HISTORIAL (PANTALLA PRINCIPAL)
// ==========================================
async function cargarMovimientos() {
    // CAMBIO AQUÍ 👇: Buscamos el nuevo ID único
    const contenedor = document.getElementById('listaMovimientosHome');
    
    if (!contenedor) return; // Si no estamos en el home, no pasa nada

    try {
        const res = await fetch(`${API_URL}/finanzas/movimientos`);
        const result = await res.json();

        if (result.success) {
            let html = '';
            
            if (result.data.length === 0) {
                contenedor.innerHTML = '<div class="text-center py-3 text-muted">No hay movimientos aún.</div>';
                return;
            }

            result.data.forEach(m => {
                // ... (Toda la lógica de iconos e IFs sigue IGUAL) ...
                let icono = 'fa-arrow-down';
                let colorIcono = 'bg-danger';
                let colorTexto = 'text-danger';
                let signo = '-';
                
                if (m.tipo === 'INGRESO') {
                    icono = 'fa-arrow-up'; colorIcono = 'bg-success'; colorTexto = 'text-success'; signo = '+';
                }
                const esTransferencia = m.categoria && m.categoria.includes('Transferencia');
                if (esTransferencia) {
                    icono = 'fa-exchange-alt'; colorIcono = 'bg-info'; colorTexto = 'text-info'; signo = '';
                }

                const fechaObj = new Date(m.fecha);
                const fechaStr = fechaObj.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
                const horaStr = fechaObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

                html += `
                <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center px-3 py-2">
                    <div class="d-flex align-items-center">
                        <div class="rounded-circle ${colorIcono} d-flex align-items-center justify-content-center me-3 shadow-sm" style="width: 35px; height: 35px;">
                            <i class="fas ${icono} text-white small"></i>
                        </div>
                        <div style="line-height: 1.2;">
                            <div class="text-white fw-bold small text-uppercase mb-0 text-truncate" style="max-width: 180px;">
                                ${m.descripcion}
                            </div>
                            <small class="text-muted" style="font-size: 0.7rem;">
                                ${fechaStr} • ${horaStr} | <span class="text-secondary">${m.nombre_cuenta || 'General'}</span>
                            </small>
                        </div>
                    </div>
                    <div class="text-end">
                        <div class="${colorTexto} fw-bold" style="font-size: 0.95rem;">
                            ${signo} S/ ${parseFloat(m.monto).toFixed(2)}
                        </div>
                    </div>
                </div>`;
            });

            contenedor.innerHTML = html;
        }
    } catch (e) {
        console.error("Error historial home:", e);
        contenedor.innerHTML = '<div class="text-center py-3 text-danger">Error datos.</div>';
    }
}

// INIT
window.onload = function() {
    // 1. Recuperar sesión
    verificarViajeEnCurso(); 

    // 2. Cargar datos iniciales
    cargarResumenDia();
    cargarHistorial();
    cargarMetaDiaria();
    cargarEstadoVehiculo();
    
    // 3. Cargar el badge rojo al inicio
    cargarObligaciones();
    cargarMovimientos();

    // --- NUEVO: DETECTAR CUANDO CIERRAS EL MODAL DE CONTRATOS ---
    const modalContratosEl = document.getElementById('modalContratos');
    if (modalContratosEl) {
        // 'hidden.bs.modal' se dispara cuando terminas de cerrar el modal (por la X, Escape o click fuera)
        modalContratosEl.addEventListener('hidden.bs.modal', function () {
            console.log("Cerraste contratos, actualizando badge...");
            cargarObligaciones(); // <--- ¡AQUÍ SE REFRESCA LA PANTALLA PRINCIPAL!
        });
    }
};