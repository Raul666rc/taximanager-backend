// ==========================================
// MÓDULO: GRÁFICOS Y VISUALIZACIÓN
// ==========================================

// MEJORA V3: Texto perfectamente centrado (Versión Final)
function dibujarDona(stats) {
    const canvas = document.getElementById('graficoApps');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (typeof miGrafico !== 'undefined' && miGrafico) miGrafico.destroy();
    
    const datosSeguros = stats || [];
    const labels = datosSeguros.length ? datosSeguros.map(e => e.origen_tipo) : ['Sin datos'];
    const values = datosSeguros.length ? datosSeguros.map(e => parseFloat(e.total)) : [1]; 
    const totalGeneral = values.reduce((a, b) => a + b, 0);

    const colors = labels.map(n => {
        if(n === 'INDRIVER') return '#198754'; 
        if(n === 'UBER') return '#f8f9fa';     
        if(n === 'CALLE') return '#ffc107';    
        return '#495057';                      
    });

    const centerTextPlugin = {
        id: 'centerText',
        beforeDraw: function(chart) {
            const { ctx, chartArea: { top, bottom, left, right } } = chart;
            ctx.restore();
            const centerX = (left + right) / 2;
            const centerY = (top + bottom) / 2;
            const chartHeight = bottom - top;
            
            // Texto "Total"
            const fontSizeLabel = (chartHeight / 140).toFixed(2);
            ctx.font = `bold ${fontSizeLabel}em sans-serif`;
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#adb5bd"; 
            const textLabel = "Total";
            const textXLabel = Math.round(centerX - (ctx.measureText(textLabel).width / 2));
            ctx.fillText(textLabel, textXLabel, centerY - 12);

            // Monto
            const fontSizeMonto = (chartHeight / 100).toFixed(2); 
            ctx.font = `bold ${fontSizeMonto}em sans-serif`;
            ctx.fillStyle = "#ffffff"; 
            const textMonto = `S/ ${totalGeneral.toFixed(0)}`;
            const textXMonto = Math.round(centerX - (ctx.measureText(textMonto).width / 2));
            ctx.fillText(textMonto, textXMonto, centerY + 12);
            ctx.save();
        }
    };

    miGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels, 
            datasets: [{ 
                data: values, 
                backgroundColor: colors, 
                borderWidth: 0, 
                hoverOffset: 10, 
                cutout: '60%' 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'right', 
                    labels: { color: 'white', usePointStyle: true, padding: 15, font: { size: 11 } } 
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            let value = parseFloat(context.parsed);
                            let porcentaje = totalGeneral > 0 ? ((value / totalGeneral) * 100).toFixed(1) + '%' : '0%';
                            return ` ${label}: S/ ${value.toFixed(2)} (${porcentaje})`;
                        }
                    }
                }
            } 
        },
        plugins: [centerTextPlugin]
    });
}

function dibujarBarras(semana) {
    const canvas = document.getElementById('graficoSemana');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (typeof miGraficoBarras !== 'undefined' && miGraficoBarras) miGraficoBarras.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(255, 193, 7, 1)');   
    gradient.addColorStop(1, 'rgba(255, 193, 7, 0.1)'); 

    const diasMap = { 'Monday':'Lun', 'Tuesday':'Mar', 'Wednesday':'Mié', 'Thursday':'Jue', 'Friday':'Vie', 'Saturday':'Sáb', 'Sunday':'Dom' };
    const labels = (semana || []).map(i => diasMap[i.dia_nombre] || i.dia_nombre);
    const data = (semana || []).map(i => i.total);

    miGraficoBarras = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels, 
            datasets: [{ 
                label: 'Ganancia Diaria', 
                data, 
                backgroundColor: gradient, 
                borderColor: '#ffc107', 
                borderWidth: 1, 
                borderRadius: 5, 
                barPercentage: 0.6 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }, 
            scales: { 
                x: { grid: { display: false }, ticks: { color: '#adb5bd' } }, 
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#adb5bd' } } 
            } 
        }
    });
}

function renderizarGraficoGastos(etiquetas, valores) {
    const canvas = document.getElementById('graficoGastos');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (typeof miGraficoEstadisticas !== 'undefined' && miGraficoEstadisticas) miGraficoEstadisticas.destroy();

    const valoresNumericos = valores.map(v => parseFloat(v) || 0);
    const coloresFondo = ['rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)'];

    miGraficoEstadisticas = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: etiquetas, 
            datasets: [{ label: 'S/ Gastados', data: valoresNumericos, backgroundColor: coloresFondo, borderColor: '#000', borderWidth: 1 }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: 'white', font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            let value = parseFloat(context.parsed);
                            let total = context.dataset.data.reduce((acc, data) => acc + (parseFloat(data) || 0), 0);
                            let porcentaje = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                            return `${label}: S/ ${value.toFixed(2)} (${porcentaje})`;
                        }
                    }
                }
            }
        }
    });
}