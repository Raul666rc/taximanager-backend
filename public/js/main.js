// public/js/main.js

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
    // Limpiar input y variables
    document.querySelector('#modalCobrar input[type="number"]').value = '';
    viajeActualId = null;
}

// --- FUNCIONES DE CONEXIÓN CON EL SERVIDOR (BACKEND) ---

// 1. INICIAR CARRERA
// EN: public/js/main.js

async function iniciarCarrera() {
    // 1. Verificar si el navegador soporta GPS
    if (!navigator.geolocation) {
        alert("Tu navegador no soporta GPS");
        return;
    }

    // Cambiamos el botón visualmente para que sepa que está "Pensando"
    const btn = document.getElementById('btnIniciar');
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> Buscando GPS...';
    btn.disabled = true;

    // 2. Pedir Coordenadas Reales
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            // ÉXITO: Tenemos ubicación
            try {
                const datos = {
                    origen_tipo: 'CALLE', 
                    lat: position.coords.latitude,  // <--- DATO REAL
                    lng: position.coords.longitude  // <--- DATO REAL
                };

                const response = await fetch(`${API_URL}/iniciar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });

                const resultado = await response.json();

                if (resultado.success) {
                    viajeActualId = resultado.data.id_viaje;
                    console.log("✅ Viaje iniciado en:", datos.lat, datos.lng);
                    mostrarPanelCarrera();
                } else {
                    alert("Error: " + resultado.message);
                }

            } catch (error) {
                console.error(error);
                alert("Error de conexión");
            } finally {
                // Restaurar botón pase lo que pase
                btn.innerHTML = textoOriginal;
                btn.disabled = false;
            }
        },
        (error) => {
            // ERROR: No dio permiso o falló el GPS
            alert("⚠️ Error de GPS: " + error.message + ". Verifica que tengas el GPS prendido.");
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        },
        { enableHighAccuracy: true } // Opción para máxima precisión
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

            // --- AGREGAR ESTA LÍNEA AQUÍ ---
        cargarResumenDia(); 
        // -------------------------------

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

async function abrirBilletera() {
    try {
        const response = await fetch(`${API_URL}/billetera`);
        const resultado = await response.json();

        if (resultado.success) {
            const data = resultado.data;

            // 1. Llenar Ahorro (Meta)
            document.getElementById('txtAhorro').innerText = `S/ ${parseFloat(data.ahorro_total).toFixed(2)}`;
            
            // 2. Llenar Saldos Reales (Busca en el array de cuentas)
            // Asumimos orden: 0=Efectivo, 1=Yape (según tu BD)
            // Una forma más segura es buscar por nombre:
            const cuentaEfectivo = data.cuentas.find(c => c.nombre.includes('Efectivo')) || { saldo_actual: 0 };
            const cuentaYape = data.cuentas.find(c => c.nombre.includes('Yape')) || { saldo_actual: 0 };

            document.getElementById('txtEfectivo').innerText = `S/ ${parseFloat(cuentaEfectivo.saldo_actual).toFixed(2)}`;
            document.getElementById('txtYape').innerText = `S/ ${parseFloat(cuentaYape.saldo_actual).toFixed(2)}`;

            // 3. Llenar Gastos
            document.getElementById('txtGastos').innerText = `S/ ${parseFloat(data.gasto_mensual).toFixed(2)}`;

            // 4. Mostrar Modal
            var modalEl = document.getElementById('modalBilletera');
            var modal = new bootstrap.Modal(modalEl);
            modal.show();

        } else {
            alert("Error cargando finanzas");
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión");
    }
}

// EJECUTAR APENAS CARGUE LA PÁGINA
window.onload = function() {
    cargarResumenDia();
};