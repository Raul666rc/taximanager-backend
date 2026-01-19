// ==========================================
// MÓDULO: GRÁFICOS (VISUALIZACIÓN)
// ==========================================

let miGrafico = null;
let miGraficoBarras = null;
let miGraficoEstadisticas = null;

// 1. DONA DE APPS (BILLETERA)
function dibujarDona(stats) {
    const canvas = document.getElementById('graficoApps');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (miGrafico) miGrafico.destroy();
    
    const data = stats || [];
    const labels = data.length ? data.map(e => e.origen_tipo) : ['Sin datos'];
    const values = data.length ? data.map(e => parseFloat(e.total)) : [1]; 
    const total = values.reduce((a, b) => a + b, 0);

    // Colores: InDriver(Verde), Uber(Blanco), Calle(Amarillo), Otros(Cian)
    const colors = labels.map(n => {
        if(n === 'INDRIVER') return '#198754'; 
        if(n === 'UBER') return '#f8f9fa';     
        if(n === 'CALLE') return '#ffc107';
        if(n === 'OTROS') return '#0dcaf0';    
        return '#495057';                      
    });

    // Plugin Texto Central
    const centerText = {
        id: 'centerText',
        beforeDraw: function(chart) {
            const { ctx, chartArea: { top, bottom, left, right } } = chart;
            ctx.restore();
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            
            ctx.font = `bold 1em sans-serif`;
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#adb5bd"; 
            const txt1 = "Total";
            ctx.fillText(txt1, cx - (ctx.measureText(txt1).width/2), cy - 12);

            ctx.font = `bold 1.2em sans-serif`;
            ctx.fillStyle = "#ffffff"; 
            const txt2 = `S/ ${total.toFixed(0)}`;
            ctx.fillText(txt2, cx - (ctx.measureText(txt2).width/2), cy + 12);
            ctx.save();
        }
    };

    miGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, cutout: '60%' }] },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: 'white', usePointStyle: true } } } 
        },
        plugins: [centerText]
    });
}

// 2. BARRAS SEMANALES (BILLETERA)
function dibujarBarras(semana) {
    const canvas = document.getElementById('graficoSemana');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (miGraficoBarras) miGraficoBarras.destroy();

    const grad = ctx.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, 'rgba(255, 193, 7, 1)');   
    grad.addColorStop(1, 'rgba(255, 193, 7, 0.1)'); 

    const dias = { 'Monday':'Lun', 'Tuesday':'Mar', 'Wednesday':'Mié', 'Thursday':'Jue', 'Friday':'Vie', 'Saturday':'Sáb', 'Sunday':'Dom' };
    const labels = (semana||[]).map(i => dias[i.dia_nombre] || i.dia_nombre);
    const vals = (semana||[]).map(i => i.total);

    miGraficoBarras = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels, 
            datasets: [{ label: 'S/', data: vals, backgroundColor: grad, borderColor: '#ffc107', borderWidth: 1, borderRadius: 5 }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } }, 
            scales: { x: { ticks: { color: '#adb5bd' }, grid: {display:false} }, y: { beginAtZero: true, ticks: { color: '#adb5bd' }, grid: {color:'rgba(255,255,255,0.1)'} } } 
        }
    });
}

// 3. ESTADÍSTICAS GASTOS (DONA GRANDE)
function renderizarGraficoGastos(labels, values) {
    const canvas = document.getElementById('graficoGastos');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (miGraficoEstadisticas) miGraficoEstadisticas.destroy();

    miGraficoEstadisticas = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels, 
            datasets: [{ 
                data: values.map(v => parseFloat(v)), 
                backgroundColor: ['#dc3545', '#ffc107', '#0dcaf0', '#0d6efd', '#6f42c1', '#adb5bd'], 
                borderWidth: 1, borderColor: '#000' 
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: 'white' } } }
        }
    });
}