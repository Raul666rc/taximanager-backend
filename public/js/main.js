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

async function registrarGasto() {
    const monto = document.getElementById('gastoMonto').value;
    const descripcion = document.getElementById('gastoDesc').value;
    
    const esYape = document.getElementById('gastoPago2').checked;
    const cuentaId = esYape ? 2 : 1; // 1:Efectivo, 2:Yape

    if (!monto || monto <= 0) {
        alert("Ingresa un monto válido");
        return;
    }

    try {
        const datos = {
            monto: parseFloat(monto),
            descripcion: descripcion,
            cuenta_id: cuentaId
        };

        const response = await fetch(`${API_URL}/gasto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const resultado = await response.json();

        if (resultado.success) {
            alert("💸 Gasto registrado: " + descripcion);
            
            // Cerrar modal
            var modalEl = document.getElementById('modalGasto');
            var modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();

            // Limpiar campo
            document.getElementById('gastoMonto').value = '';

            // Opcional: Podríamos recargar el resumen si mostráramos el saldo neto
            // cargarResumenDia(); 
        } else {
            alert("Error: " + resultado.message);
        }

    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}

// En public/js/main.js (al final)
let miGrafico = null; // Variable global para controlar el gráfico

// Modificamos la función para aceptar el periodo (por defecto 'mes')
async function abrirBilletera(periodo = 'mes') {
    try {
        // Marcamos visualmente el botón seleccionado (opcional, pero ayuda)
        // (El input radio ya lo hace, pero esto asegura que la petición sea correcta)
        
        // Enviamos el periodo en la URL
        const response = await fetch(`${API_URL}/billetera?periodo=${periodo}`);
        const resultado = await response.json();

        if (resultado.success) {
            const data = resultado.data;

            // ... (Llenado de textos Ahorro/Efectivo/Gastos IGUAL QUE ANTES) ...
            document.getElementById('txtAhorro').innerText = `S/ ${parseFloat(data.ahorro_total).toFixed(2)}`;
            const cuentaEfectivo = data.cuentas.find(c => c.nombre.includes('Efectivo')) || { saldo_actual: 0 };
            const cuentaYape = data.cuentas.find(c => c.nombre.includes('Yape')) || { saldo_actual: 0 };
            document.getElementById('txtEfectivo').innerText = `S/ ${parseFloat(cuentaEfectivo.saldo_actual).toFixed(2)}`;
            document.getElementById('txtYape').innerText = `S/ ${parseFloat(cuentaYape.saldo_actual).toFixed(2)}`;
            document.getElementById('txtGastos').innerText = `S/ ${parseFloat(data.gasto_mensual).toFixed(2)}`;


            // --- LÓGICA DEL GRÁFICO MEJORADA ---
            const ctx = document.getElementById('graficoApps').getContext('2d');
            
            if (miGrafico) {
                miGrafico.destroy();
            }

            // Si no hay datos en ese periodo, mostramos gráfico vacío o manejamos error
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
                // Si está vacío, una dona gris vacía
                etiquetas = ['Sin datos'];
                valores = [1];
                coloresFondo = ['#333'];
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
                        legend: {
                            position: 'right',
                            labels: { color: 'white', boxWidth: 12 }
                        },
                        // AQUÍ ESTÁ LA MAGIA DEL PORCENTAJE
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    let value = context.raw || 0;
                                    
                                    // Calcular total para sacar %
                                    let total = context.chart._metasets[context.datasetIndex].total;
                                    let percentage = Math.round((value / total) * 100) + '%';
                                    
                                    if(label === 'Sin datos') return 'No hay carreras';

                                    return `${label}: S/ ${value} (${percentage})`;
                                }
                            }
                        }
                    }
                }
            });

            // Solo mostrar modal si no estamos "refrescando" el filtro
            // (Truco: verificamos si el modal ya está abierto)
            var modalEl = document.getElementById('modalBilletera');
            if (!modalEl.classList.contains('show')) {
                var modal = new bootstrap.Modal(modalEl);
                modal.show();
            }

        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
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
// EJECUTAR APENAS CARGUE LA PÁGINA
window.onload = function() {
    cargarResumenDia();
    cargarHistorial();
};