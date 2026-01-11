// public/js/main.js

// --- 1. VERIFICACIÓN DE SEGURIDAD ---
const usuarioLogueado = localStorage.getItem('taxi_user');

if (!usuarioLogueado) {
    // Si no tiene la llave, ¡fuera de aquí!
    window.location.href = 'login.html';
}
// ------------------------------------

// ANTES:
// const API_URL = 'http://localhost:3000/api/viajes';

// AHORA (Borrale el dominio, deja solo la carpeta):
const API_URL = '/api/viajes';
let viajeActualId = null; 
let miGrafico = null; // Variable global para controlar el gráfico
let miGraficoBarras = null;

// --- FUNCIONES DE LA INTERFAZ (UI) ---

function mostrarPanelCarrera() {
    document.getElementById('btnIniciar').classList.add('d-none');
    document.getElementById('panelEnCarrera').classList.remove('d-none');
}

function mostrarPanelInicio() {
    document.getElementById('panelEnCarrera').classList.add('d-none');
    document.getElementById('btnIniciar').classList.remove('d-none');

    // --- AGREGAR ESTO: Volver a mostrar el selector de Apps ---
    const selector = document.getElementById('selectorApps');
    if(selector) selector.classList.remove('d-none');
    // ----------------------------------------------------------

    // Limpiar input y variables
    document.querySelector('#modalCobrar input[type="number"]').value = '';
    viajeActualId = null;
}

// --- FUNCIONES DE CONEXIÓN CON EL SERVIDOR (BACKEND) ---

// 1. INICIAR CARRERA
// EN: public/js/main.js

async function iniciarCarrera() {
    if (!navigator.geolocation) {
        alert("Tu navegador no soporta GPS");
        return;
    }

    // --- NUEVO: OBTENER LA APP SELECCIONADA ---
    // Buscamos cuál radio button tiene la propiedad "checked"
    const appSeleccionada = document.querySelector('input[name="appOrigen"]:checked').value;
    // ------------------------------------------

    const btn = document.getElementById('btnIniciar');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> Buscando GPS...';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const datos = {
                    origen_tipo: appSeleccionada, // <--- AQUÍ ENVIAMOS EL DATO (Antes decía 'CALLE')
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
                    
                    // Ocultamos el selector cuando arranca la carrera (para que no estorbe)
                    document.getElementById('selectorApps').classList.add('d-none');
                    
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
            alert("⚠️ Error de GPS: " + error.message);
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        },
        { enableHighAccuracy: true }
    );
}

// 2. REGISTRAR PARADA
async function registrarParada() {
    if (!viajeActualId) return;

    try {
        const datos = {
            id_viaje: viajeActualId,
            lat: -13.165000, 
            lng: -74.225000,
            tipo: 'PARADA'
        };

        await fetch(`${API_URL}/parada`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        
        alert("📍 Parada registrada");

    } catch (error) {
        console.error(error);
    }
}

// 3. FINALIZAR Y COBRAR
async function guardarCarrera() {
    const montoInput = document.querySelector('#modalCobrar input[type="number"]').value;
    
    // Detectar pago
    const esYape = document.getElementById('pago2').checked; 
    const metodoId = esYape ? 2 : 1; // 1:Efectivo, 2:Yape/Plin (Según tu BD)

    if (!montoInput || montoInput <= 0) {
        alert("Ingresa un monto válido");
        return;
    }

    try {
        const datos = {
            id_viaje: viajeActualId,
            monto: parseFloat(montoInput),
            metodo_pago_id: metodoId,
            lat: -13.170000,
            lng: -74.230000
        };

        const response = await fetch(`${API_URL}/finalizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const resultado = await response.json();

        if (resultado.success) {
            alert("💰 ¡Cobrado! Dinero distribuido automáticamente.");
            
            // Cerrar modal usando Bootstrap
            var modalEl = document.getElementById('modalCobrar');
            var modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();

            mostrarPanelInicio();
            cargarHistorial();
            cargarResumenDia();
            cargarMetaDiaria(); 

        } else {
            alert("Error al cobrar: " + resultado.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión al cobrar");
    }
}

async function cargarResumenDia() {
    try {
        const response = await fetch(`${API_URL}/resumen`);
        const resultado = await response.json();
        
        if (resultado.success) {
            // Buscamos el elemento H1 donde va el dinero
            const etiqueta = document.getElementById('gananciaDia');
            // Formateamos a soles (ej: S/ 15.50)
            etiqueta.innerText = `S/ ${parseFloat(resultado.total).toFixed(2)}`;
            
            // Lógica visual de la barra de progreso (Meta: 160 soles)
            const porcentaje = (resultado.total / 160) * 100;
            const barra = document.querySelector('.progress-bar');
            barra.style.width = `${porcentaje}%`;
            
            // Si pasas la meta, se pone verde
            if(porcentaje >= 100) {
                barra.classList.remove('bg-warning');
                barra.classList.add('bg-success');
            }
        }
    } catch (error) {
        console.error("Error cargando resumen:", error);
    }
}

async function guardarGasto() {
    const montoInput = document.getElementById('montoGasto');
    const monto = parseFloat(montoInput.value);
    
    // Obtener qué botón de radio está marcado
    const categoria = document.querySelector('input[name="tipoGasto"]:checked').value;

    if (!monto || monto <= 0) {
        alert("Ingresa un monto válido");
        return;
    }

    // Desactivar botón para evitar doble click
    const btnGuardar = document.querySelector('#modalGasto button.btn-danger');
    const textoOriginal = btnGuardar.innerHTML;
    btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btnGuardar.disabled = true;

    try {
        // Reutilizamos el endpoint de transacciones que ya tenías
        // Enviamos 'Gasto - Categoria' como descripción para que quede claro en el Excel
        const response = await fetch(`${API_URL}/transaccion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo: 'GASTO',
                monto: monto,
                descripcion: `Gasto - ${categoria}` // Ej: "Gasto - Combustible"
            })
        });

        const resultado = await response.json();

        if (resultado.success) {
            alert(`💸 Gasto de S/ ${monto} registrado en ${categoria}`);
            
            // Limpiar y Cerrar Modal
            montoInput.value = '';
            var modalEl = document.getElementById('modalGasto');
            var modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();

            // Actualizar datos
            cargarMetaDiaria(); // Si la meta fuera neta, esto bajaría (opcional)
            // Si tuvieramos "Dinero en Mano", aquí se restaría.
        } else {
            alert("Error: " + resultado.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    } finally {
        btnGuardar.innerHTML = textoOriginal;
        btnGuardar.disabled = false;
    }
}


async function abrirBilletera(periodo = 'mes') {
    try {
        const response = await fetch(`${API_URL}/billetera?periodo=${periodo}`);
        const resultado = await response.json();

        if (resultado.success) {
            const data = resultado.data;

            // 1. LLENAR TEXTOS
            document.getElementById('txtAhorro').innerText = `S/ ${parseFloat(data.ahorro_total).toFixed(2)}`;
            const cuentaEfectivo = data.cuentas.find(c => c.nombre.includes('Efectivo')) || { saldo_actual: 0 };
            const cuentaYape = data.cuentas.find(c => c.nombre.includes('Yape')) || { saldo_actual: 0 };
            document.getElementById('txtEfectivo').innerText = `S/ ${parseFloat(cuentaEfectivo.saldo_actual).toFixed(2)}`;
            document.getElementById('txtYape').innerText = `S/ ${parseFloat(cuentaYape.saldo_actual).toFixed(2)}`;
            document.getElementById('txtGastos').innerText = `S/ ${parseFloat(data.gasto_mensual).toFixed(2)}`;

            // ==========================================
            //       GRÁFICO 1: DONA (APPS)
            // ==========================================
            const ctx = document.getElementById('graficoApps').getContext('2d');
            
            if (miGrafico) miGrafico.destroy();

            let etiquetas = [];
            let valores = [];
            let coloresFondo = [];

            if (data.estadisticas.length > 0) {
                etiquetas = data.estadisticas.map(e => e.origen_tipo);
                valores = data.estadisticas.map(e => e.total);
                coloresFondo = etiquetas.map(nombre => {
                    if(nombre === 'INDRIVER') return '#198754';
                    if(nombre === 'UBER') return '#f8f9fa';
                    if(nombre === 'CALLE') return '#ffc107';
                    return '#6c757d';
                });
            } else {
                etiquetas = ['Sin datos']; valores = [1]; coloresFondo = ['#333'];
            }

            miGrafico = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: etiquetas,
                    datasets: [{
                        data: valores,
                        backgroundColor: coloresFondo,
                        borderColor: '#000',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: 'white', boxWidth: 12 } }
                    }
                }
            });

            // ==========================================
            //       GRÁFICO 2: BARRAS (SEMANA)
            // ==========================================
            // Verificamos si existe el canvas antes de dibujar (para evitar errores si no cargó el HTML)
            const canvasBarras = document.getElementById('graficoSemana');
            
            if (canvasBarras) {
                const ctxBarras = canvasBarras.getContext('2d');
                
                if (miGraficoBarras) miGraficoBarras.destroy();

                const diasIngles = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                const diasEsp = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

                const etiquetasSemana = (data.semana || []).map(item => {
                    const index = diasIngles.indexOf(item.dia_nombre);
                    return index >= 0 ? diasEsp[index] : item.dia_nombre;
                });
                const valoresSemana = (data.semana || []).map(item => item.total);

                miGraficoBarras = new Chart(ctxBarras, {
                    type: 'bar',
                    data: {
                        labels: etiquetasSemana,
                        datasets: [{
                            label: 'S/',
                            data: valoresSemana,
                            backgroundColor: '#ffc107',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#333' }, ticks: { color: '#aaa' } },
                            x: { grid: { display: false }, ticks: { color: '#fff' } }
                        }
                    }
                });
            }

            // MOSTRAR MODAL
            // Solo si no está visible ya
            var modalEl = document.getElementById('modalBilletera');
            if (!modalEl.classList.contains('show')) {
                var modal = new bootstrap.Modal(modalEl);
                modal.show();
            }
        }
    } catch (error) {
        console.error("Error billetera:", error);
        alert("Error cargando billetera");
    }
}
// public/js/main.js

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

            // Recorrer cada viaje y dibujar su tarjeta
            lista.forEach(viaje => {
                // Definir colores e iconos según el tipo
                let badgeColor = 'bg-secondary';
                if(viaje.origen_tipo === 'INDRIVER') badgeColor = 'bg-success';
                if(viaje.origen_tipo === 'UBER') badgeColor = 'bg-light text-dark';
                if(viaje.origen_tipo === 'CALLE') badgeColor = 'bg-warning text-dark';

                // Definir icono de pago
                const iconoPago = viaje.metodo_cobro_id === 1 
                    ? '<i class="fas fa-money-bill-wave text-success"></i>' 
                    : '<i class="fas fa-mobile-alt text-warning"></i>';

                const html = `
                <div class="card bg-dark border-secondary mb-2">
                    <div class="card-body p-2 d-flex align-items-center">
                        
                        <div class="me-3">
                            <button class="btn btn-outline-danger btn-sm border-0 p-2" onclick="confirmarAnulacion(${viaje.id})">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>

                        <div class="d-flex flex-column flex-grow-1">
                            <div class="mb-1">
                                <span class="badge ${badgeColor}">${viaje.origen_tipo}</span>
                            </div>
                            <div class="text-info small fw-bold" style="font-size: 0.8rem;">
                                <i class="far fa-clock me-1"></i>${viaje.hora_fin || '--:--'}
                            </div>
                        </div>

                        <div class="text-end ms-2">
                            <div class="fw-bold text-white fs-5 lh-1">S/ ${parseFloat(viaje.monto_cobrado).toFixed(2)}</div>
                            <div class="mt-1">${iconoPago}</div>
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


function confirmarAnulacion(id) {
    if(confirm("¿Seguro que quieres anular esta carrera? Se restará el dinero de la caja.")) {
        anularCarrera(id);
    }
}

async function anularCarrera(id) {
    try {
        const response = await fetch(`${API_URL}/anular/${id}`, {
            method: 'DELETE' // Coincide con la ruta router.delete
        });
        
        const resultado = await response.json();

        if (resultado.success) {
            // Recargamos todo para ver los números bajar
            cargarResumenDia();
            cargarHistorial();
            cargarMetaDiaria();
            alert("🗑️ Carrera eliminada y dinero descontado.");
        } else {
            alert("Error: " + resultado.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}


function cerrarSesion() {
    if(confirm("¿Cerrar sesión?")) {
        localStorage.removeItem('taxi_user');
        window.location.href = 'login.html';
    }
}

async function cargarMetaDiaria() {
    try {
        // Pedimos los datos (aprovechamos que el endpoint de billetera ya trae todo, 
        // pero para ser más eficientes, sería mejor pedir solo lo de hoy. 
        // Por ahora, para no complicar, usaremos el historial que ya cargamos).
        
        // 1. Calcular Ganancia de HOY sumando el historial que ya tenemos en pantalla
        // (Esto es un truco para no hacer otra petición al servidor)
        const response = await fetch(`${API_URL}/historial`);
        const resultado = await response.json();
        
        let gananciaHoy = 0;
        if (resultado.success) {
            // Sumar todos los montos de la lista
            gananciaHoy = resultado.data.reduce((sum, viaje) => sum + parseFloat(viaje.monto_cobrado), 0);
        }

        // 2. Pedir la Meta (podemos usar el endpoint de billetera o crear uno simple, 
        // pero para rápido, vamos a hardcodear la meta visualmente o pedirla a billetera)
        // MEJOR OPCIÓN: Llamar a billetera para sacar la meta real de la BD
        const respBilletera = await fetch(`${API_URL}/billetera?periodo=hoy`);
        const resBilletera = await respBilletera.json();
        const meta = parseFloat(resBilletera.data.meta_diaria) || 200;

        // 3. Calcular Porcentajes
        let porcentaje = (gananciaHoy / meta) * 100;
        if (porcentaje > 100) porcentaje = 100;

        // 4. Pintar la Barra
        document.getElementById('txtProgreso').innerText = `S/ ${gananciaHoy.toFixed(0)} / ${meta}`;
        document.getElementById('txtPorcentaje').innerText = `${porcentaje.toFixed(0)}%`;
        
        const barra = document.getElementById('barraMeta');
        barra.style.width = `${porcentaje}%`;

        // 5. Cambiar colores y frases según avance
        const frase = document.getElementById('fraseMotivacional');
        
        if (porcentaje < 20) {
            barra.classList.remove('bg-success');
            barra.classList.add('bg-warning');
            frase.innerText = "☕ Calentando motores...";
        } else if (porcentaje < 50) {
            frase.innerText = "🚕 ¡Buen ritmo! Vamos por la mitad.";
        } else if (porcentaje < 80) {
            barra.classList.remove('bg-warning');
            barra.classList.add('bg-info');
            frase.innerText = "🔥 ¡Ya falta poco!";
        } else if (porcentaje >= 100) {
            barra.classList.remove('bg-info', 'bg-warning');
            barra.classList.add('bg-success');
            frase.innerText = "🎉 ¡META CUMPLIDA! Todo extra es ganancia pura.";
        }

    } catch (error) {
        console.error("Error meta:", error);
    }
}

async function cambiarMeta() {
    // 1. Preguntar al usuario con una ventanita simple
    const actual = document.getElementById('txtProgreso').innerText.split('/')[1]?.trim() || "200";
    const nuevaMeta = prompt("¿Cuál es tu meta de dinero para hoy?", actual);

    // Si el usuario cancela o lo deja vacío, no hacemos nada
    if (!nuevaMeta || isNaN(nuevaMeta) || nuevaMeta <= 0) return;

    try {
        // 2. Enviar al servidor
        const response = await fetch(`${API_URL}/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nueva_meta: nuevaMeta })
        });

        const resultado = await response.json();

        if (resultado.success) {
            // 3. Recargar la barra para ver el cambio
            cargarMetaDiaria();
        } else {
            alert("Error al guardar la meta");
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}

function descargarExcel() {
    if(confirm("¿Quieres descargar todo tu historial de viajes a tu celular/PC?")) {
        // Truco: Abrimos la URL del backend directamente
        window.location.href = `${API_URL}/reporte`;
    }
}

// EJECUTAR APENAS CARGUE LA PÁGINA
window.onload = function() {
    cargarResumenDia();
    cargarHistorial();
    cargarMetaDiaria();
};