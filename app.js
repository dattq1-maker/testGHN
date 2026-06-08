// Global Data Storage
let originalRawData = [];
let rawData = [];

// Chart Instances
let statusChartInstance = null;
let tenureChartInstance = null;
let amTurnoverChartInstance = null;
let bcTurnoverChartInstance = null;
let percentileTurnoverChartInstance = null;

// Chart.js Default Config for Dark Theme
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Tab Switching Logic
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            if (item.classList.contains('disabled')) return;

            // Update Nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update Tabs
            const targetTab = item.getAttribute('data-tab');
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === `tab-${targetTab}`) {
                    pane.classList.add('active');
                }
            });
        });
    });

    // Excel Upload Logic
    const uploadInput = document.getElementById('excel-upload');
    const uploadStatus = document.getElementById('upload-status');

    uploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadStatus.textContent = 'Đang đọc dữ liệu...';
        uploadStatus.style.color = '#f59e0b';

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                // Find sheets, allowing for slight case variations
                const sheetNames = workbook.SheetNames;
                const dataLuongName = sheetNames.find(s => s.toLowerCase().includes('data lương')) || sheetNames.find(s => s.toLowerCase().includes('lương')) || sheetNames[0];
                const workforceName = sheetNames.find(s => s.toLowerCase().includes('workforce')) || sheetNames.find(s => s.toLowerCase().includes('nhân sự')) || sheetNames[1];

                if (!workbook.Sheets[dataLuongName] || !workbook.Sheets[workforceName]) {
                    throw new Error("File Excel phải chứa đủ 2 sheet: 'Data lương' và 'Workforce'");
                }

                // Convert both sheets to JSON
                const dataLuongArray = XLSX.utils.sheet_to_json(workbook.Sheets[dataLuongName]);
                const workforceArray = XLSX.utils.sheet_to_json(workbook.Sheets[workforceName]);
                
                // Create lookup dictionary from Workforce based on ID
                const workforceDict = {};
                workforceArray.forEach(row => {
                    const id = row['ID'] || row['id'] || row['Mã NV'] || row['Mã nhân viên'];
                    if (id) workforceDict[id] = row;
                });

                // Merge data: Base is Data lương, pull HR info from Workforce
                originalRawData = dataLuongArray.map(row => {
                    const id = row['ID'] || row['id'] || row['Mã NV'] || row['Mã nhân viên'];
                    const wfRow = id ? (workforceDict[id] || {}) : {};
                    
                    return {
                        ...wfRow, // Spread Workforce properties (Trạng thái, Thâm niên, etc)
                        ...row    // Spread Data lương properties (overwrite ID, add Thu nhập)
                    };
                });

                rawData = [...originalRawData];
                
                uploadStatus.textContent = `Đã tải và ghép thành công ${rawData.length} bản ghi từ 2 sheet!`;
                uploadStatus.style.color = '#10b981';
                
                // Process Data and Render Charts
                processAndRenderData();
            } catch (err) {
                console.error(err);
                uploadStatus.textContent = err.message.includes('sheet') ? err.message : 'Lỗi khi đọc file Excel!';
                uploadStatus.style.color = '#ef4444';
            }
        };
        reader.readAsArrayBuffer(file);
    });

    // Date Filter Logic
    const btnFilter = document.getElementById('btn-apply-filter');
    const filterStatus = document.getElementById('filter-status');

    btnFilter.addEventListener('click', () => {
        if (originalRawData.length === 0) {
            filterStatus.textContent = 'Vui lòng tải file dữ liệu trước!';
            filterStatus.style.color = '#ef4444';
            return;
        }

        const startDateStr = document.getElementById('filter-start').value;
        const endDateStr = document.getElementById('filter-end').value;

        if (!startDateStr && !endDateStr) {
            rawData = [...originalRawData];
            filterStatus.textContent = 'Đã bỏ lọc, hiện toàn bộ.';
            filterStatus.style.color = '#10b981';
            processAndRenderData();
            return;
        }

        const startTimestamp = startDateStr ? new Date(startDateStr).getTime() : 0;
        const endTimestamp = endDateStr ? new Date(endDateStr).setHours(23, 59, 59, 999) : Infinity;

        rawData = originalRawData.filter(row => {
            const joinDateStr = row['Ngày vào làm'];
            if (!joinDateStr) return false;
            
            const joinTimestamp = new Date(joinDateStr).getTime();
            if (isNaN(joinTimestamp)) return false;

            return joinTimestamp >= startTimestamp && joinTimestamp <= endTimestamp;
        });

        filterStatus.textContent = `Đã lọc còn ${rawData.length} bản ghi.`;
        filterStatus.style.color = '#3b82f6';
        processAndRenderData();
    });
});

function processAndRenderData() {
    if (rawData.length === 0) return;

    // 1. Calculate KPIs
    const total = rawData.length;
    let active = 0;
    let resigned = 0;
    let newbie = 0; // < 3 months

    rawData.forEach(row => {
        const status = row['Trạng thái'] || '';
        const tenure = row['Thâm niên'] || '';
        
        if (status.includes('Đang làm việc')) {
            active++;
        } else if (status.includes('Nghỉ việc')) {
            resigned++;
        }

        // Categorize Newbies based on 'Phân loại thâm niên' or 'Thâm niên'
        // According to context: G01: Dưới 1 tháng, G02: 1-2 tháng, G03: 2-3 tháng
        if (tenure.includes('G01') || tenure.includes('G02') || tenure.includes('G03') || tenure.toLowerCase().includes('dưới 3 tháng')) {
            newbie++;
        }
    });

    // Update DOM KPIs
    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-active').textContent = active;
    document.getElementById('kpi-active-pct').textContent = `${((active/total)*100).toFixed(1)}%`;
    document.getElementById('kpi-resigned').textContent = resigned;
    document.getElementById('kpi-resigned-pct').textContent = `${((resigned/total)*100).toFixed(1)}%`;
    document.getElementById('kpi-newbie').textContent = newbie;

    // 2. Render Charts
    renderStatusChart(active, resigned);
    renderTenureChart();
    renderAmTurnoverChart();
    renderBcTurnoverChart();

    // 3. Process Productivity / Income Percentiles if data exists
    if (rawData.length > 0 && rawData[0].hasOwnProperty('Thu nhập')) {
        renderPercentileReport();
    } else {
        const tbody = document.querySelector('#percentileTable tbody');
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Chưa có dữ liệu cột "Thu nhập" trong file Excel.</td></tr>`;
        if (percentileTurnoverChartInstance) percentileTurnoverChartInstance.destroy();
    }
}

// Chart Renderers
function renderStatusChart(active, resigned) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    if (statusChartInstance) statusChartInstance.destroy();

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Đang làm việc', 'Đã nghỉ việc'],
            datasets: [{
                data: [active, resigned],
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            cutout: '70%'
        }
    });
}

function renderTenureChart() {
    // Process tenure distribution
    const tenureDist = {};
    rawData.forEach(row => {
        const t = row['Thâm niên'] || 'Khác';
        if (!tenureDist[t]) tenureDist[t] = { active: 0, resigned: 0 };
        
        const status = row['Trạng thái'] || '';
        if (status.includes('Đang làm việc')) tenureDist[t].active++;
        else if (status.includes('Nghỉ việc')) tenureDist[t].resigned++;
    });

    const labels = Object.keys(tenureDist).sort();
    const activeData = labels.map(l => tenureDist[l].active);
    const resignedData = labels.map(l => tenureDist[l].resigned);

    const ctx = document.getElementById('tenureChart').getContext('2d');
    if (tenureChartInstance) tenureChartInstance.destroy();

    tenureChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => l.substring(0, 15) + (l.length > 15 ? '...' : '')), // truncate long labels
            datasets: [
                { label: 'Đang làm', data: activeData, backgroundColor: '#3b82f6' },
                { label: 'Đã nghỉ', data: resignedData, backgroundColor: '#ef4444' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true }
            }
        }
    });
}

function renderAmTurnoverChart() {
    // Only resigned
    const resignedData = rawData.filter(r => (r['Trạng thái'] || '').includes('Nghỉ việc'));
    
    const amCount = {};
    resignedData.forEach(row => {
        const am = row['AM'] || 'N/A';
        amCount[am] = (amCount[am] || 0) + 1;
    });

    // Sort by count desc
    const sortedAms = Object.entries(amCount).sort((a, b) => b[1] - a[1]).slice(0, 15); // Top 15 AMs

    const ctx = document.getElementById('amTurnoverChart').getContext('2d');
    if (amTurnoverChartInstance) amTurnoverChartInstance.destroy();

    amTurnoverChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedAms.map(item => item[0]),
            datasets: [{
                label: 'Số người nghỉ việc',
                data: sortedAms.map(item => item[1]),
                backgroundColor: '#f59e0b',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // horizontal bar
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderBcTurnoverChart() {
    // Only resigned
    const resignedData = rawData.filter(r => (r['Trạng thái'] || '').includes('Nghỉ việc'));
    
    const bcCount = {};
    resignedData.forEach(row => {
        const bc = row['Bưu cục'] || 'N/A';
        bcCount[bc] = (bcCount[bc] || 0) + 1;
    });

    // Sort by count desc, get Top 10
    const sortedBcs = Object.entries(bcCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const ctx = document.getElementById('bcTurnoverChart').getContext('2d');
    if (bcTurnoverChartInstance) bcTurnoverChartInstance.destroy();

    bcTurnoverChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedBcs.map(item => item[0].replace('Bưu cục ', '').substring(0, 20)),
            datasets: [{
                label: 'Số lượng nghỉ việc',
                data: sortedBcs.map(item => item[1]),
                backgroundColor: '#6366f1',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderPercentileReport() {
    // Sort by Income
    const sortedData = [...rawData].filter(r => !isNaN(parseFloat(r['Thu nhập'])))
                                 .sort((a, b) => parseFloat(a['Thu nhập']) - parseFloat(b['Thu nhập']));
    
    if (sortedData.length === 0) return;

    const percentiles = [10, 25, 50, 75, 90, 95, 99, 100];
    const groupNames = ['Dưới P10', 'P10 - P25', 'P25 - P50', 'P50 - P75', 'P75 - P90', 'P90 - P95', 'P95 - P99', 'P99 - P100'];
    
    const results = [];
    let startIdx = 0;
    const total = sortedData.length;

    for (let i = 0; i < percentiles.length; i++) {
        let endIdx = Math.floor((percentiles[i] / 100.0) * total);
        if (endIdx === startIdx) endIdx += 1;
        
        const groupData = sortedData.slice(startIdx, endIdx);
        
        if (groupData.length > 0) {
            const count = groupData.length;
            const avgIncome = groupData.reduce((sum, row) => sum + parseFloat(row['Thu nhập']), 0) / count;
            const maxIncome = Math.max(...groupData.map(row => parseFloat(row['Thu nhập'])));
            
            // Calculate average tenure based on 'Số ngày làm việc'
            const avgTenure = groupData.reduce((sum, row) => sum + parseFloat(row['Số ngày làm việc'] || 0), 0) / count;
            
            const resignedCount = groupData.filter(row => (row['Trạng thái'] || '').includes('Nghỉ việc')).length;
            const turnoverRate = (resignedCount / count) * 100;
            
            results.push({
                groupName: groupNames[i],
                count: count,
                avgIncome: avgIncome,
                maxIncome: maxIncome,
                avgTenure: avgTenure,
                turnoverRate: turnoverRate
            });
        }
        startIdx = endIdx;
    }

    // Render Table
    const tbody = document.querySelector('#percentileTable tbody');
    tbody.innerHTML = '';
    
    results.forEach(row => {
        const tr = document.createElement('tr');
        
        // Format Currency
        const formatCurrency = (val) => new Intl.NumberFormat('vi-VN').format(Math.round(val));
        
        // Badge color for turnover
        let badgeClass = 'badge-success';
        if (row.turnoverRate > 50) badgeClass = 'badge-warning';
        if (row.turnoverRate > 80) badgeClass = 'badge-danger';

        tr.innerHTML = `
            <td style="font-weight: 500; color: var(--accent-blue);">${row.groupName}</td>
            <td>${row.count}</td>
            <td>${Math.round(row.avgTenure)} ngày</td>
            <td>${formatCurrency(row.avgIncome)} đ</td>
            <td>${formatCurrency(row.maxIncome)} đ</td>
            <td><span class="badge ${badgeClass}">${row.turnoverRate.toFixed(1)}%</span></td>
        `;
        tbody.appendChild(tr);
    });

    // Render Chart
    const ctx = document.getElementById('percentileTurnoverChart').getContext('2d');
    if (percentileTurnoverChartInstance) percentileTurnoverChartInstance.destroy();

    percentileTurnoverChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: results.map(r => r.groupName),
            datasets: [{
                label: 'Tỷ lệ nghỉ việc (%)',
                data: results.map(r => r.turnoverRate.toFixed(1)),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#ef4444',
                pointRadius: 4,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}
