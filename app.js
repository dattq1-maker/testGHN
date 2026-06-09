// Global Data Storage
let originalRawData = [];
let rawData = [];

// Chart Instances
let statusChartInstance = null;
let tenureChartInstance = null;
let amTurnoverChartInstance = null;
let bcTurnoverChartInstance = null;
let percentileTurnoverChartInstance = null;
let tenureTurnoverChartInstance = null;

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

    // UI Elements for Data Loading
    const syncStatus = document.getElementById('sync-status');
    const btnReload = document.getElementById('btn-reload-data');

    // Auto load data on startup
    loadData(syncStatus);

    // Manual reload button
    if (btnReload) {
        btnReload.addEventListener('click', () => {
            loadData(syncStatus);
        });
    }

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

            // Find resignation date
            const resignDateStr = row['Ngày nghỉ việc'] || row['Tháng nghỉ việc'] || null;
            let resignTimestamp = Infinity;
            if (resignDateStr) {
                const parsed = new Date(resignDateStr).getTime();
                if (!isNaN(parsed)) resignTimestamp = parsed;
            }

            // POINT-IN-TIME LOGIC
            // Include if they joined at or before the End Date
            // AND (they never resigned OR they resigned at or after the Start Date)
            return joinTimestamp <= endTimestamp && resignTimestamp >= startTimestamp;
        });

        filterStatus.textContent = `Đã lọc còn ${rawData.length} nhân sự đang làm việc trong khoảng thời gian này.`;
        filterStatus.style.color = '#3b82f6';
        processAndRenderData();
    });
});

async function loadData(statusElement) {
    if (!statusElement) return;
    statusElement.textContent = 'Đang tải dữ liệu tự động...';
    statusElement.style.color = '#f59e0b';
    
    try {
        // Thêm ?t=timestamp để chống cache của trình duyệt (giúp luôn lấy file mới nhất)
        const cacheBuster = new Date().getTime();
        const response = await fetch(`./latest_data.json?t=${cacheBuster}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const payload = await response.json();
        
        if (!payload || !payload.data) {
            throw new Error('Định dạng dữ liệu không hợp lệ!');
        }
        
        originalRawData = payload.data;
        rawData = [...originalRawData];
        lastUpdatedStr = payload.last_updated || "Không rõ";
        
        statusElement.textContent = `Đã đồng bộ thành công ${rawData.length} bản ghi! (Cập nhật: ${lastUpdatedStr})`;
        statusElement.style.color = '#10b981';
        
        processAndRenderData();
        
    } catch (error) {
        console.error('Error loading JSON data:', error);
        statusElement.textContent = 'Lỗi tải dữ liệu. Vui lòng kiểm tra file latest_data.json!';
        statusElement.style.color = '#ef4444';
    }
}

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
    renderTenureTurnoverChart();

    // 3. Process Productivity / Income Percentiles if data exists
    const incomeCol = Object.keys(rawData[0]).find(k => k.toLowerCase().includes('lương nếu đủ 30 ngày')) || Object.keys(rawData[0]).find(k => k.toLowerCase().includes('thu nhập'));

    if (rawData.length > 0 && incomeCol) {
        renderPercentileReport(incomeCol);
        renderIncomeWarnings(incomeCol);
    } else {
        const tbody = document.querySelector('#percentileTable tbody');
        tbody.replaceChildren(); // Safely clear
        
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.style.textAlign = 'center';
        td.style.padding = '2rem';
        td.style.color = 'var(--text-secondary)';
        td.textContent = 'Chưa có dữ liệu cột "Lương nếu đủ 30 ngày" trong file Excel.';
        
        tr.appendChild(td);
        tbody.appendChild(tr);
        
        if (percentileTurnoverChartInstance) percentileTurnoverChartInstance.destroy();
        
        // Clear warnings too
        document.querySelector('#warningLowTable tbody').replaceChildren();
        document.querySelector('#warningHighTable tbody').replaceChildren();
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

function renderIncomeWarnings(incomeCol) {
    if (rawData.length === 0 || !incomeCol) return;

    // Lọc data hợp lệ
    const validData = rawData.filter(row => row[incomeCol] && !isNaN(parseFloat(row[incomeCol])));

    // Tách 2 danh sách
    const lowIncomeData = validData.filter(row => parseFloat(row[incomeCol]) < 5000000);
    const highIncomeData = validData.filter(row => parseFloat(row[incomeCol]) > 40000000);

    // Sắp xếp: Thấp xếp người thấp nhất lên đầu, Cao xếp người cao nhất lên đầu
    lowIncomeData.sort((a, b) => parseFloat(a[incomeCol]) - parseFloat(b[incomeCol]));
    highIncomeData.sort((a, b) => parseFloat(b[incomeCol]) - parseFloat(a[incomeCol]));

    const formatCurrency = (val) => new Intl.NumberFormat('vi-VN').format(Math.round(val));

    const renderTable = (tableId, dataList) => {
        const tbody = document.querySelector(`#${tableId} tbody`);
        tbody.replaceChildren();

        if (dataList.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.style.textAlign = 'center';
            td.style.padding = '2rem';
            td.style.color = 'var(--text-secondary)';
            td.textContent = 'Không có báo cáo bất thường nào.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        dataList.forEach(row => {
            const tr = document.createElement('tr');
            
            const idCol = row['ID'] || row['id'] || row['Mã NV'] || row['Mã nhân viên'] || 'N/A';
            const nameCol = row['Tên nhân viên'] || row['Tên'] || 'N/A';
            const bcCol = row['Bưu cục'] || 'N/A';
            const tenureCol = row['Phân loại thâm niên'] || 'Chưa rõ';
            const incomeVal = parseFloat(row[incomeCol]);

            [idCol, nameCol, bcCol, tenureCol].forEach(text => {
                const td = document.createElement('td');
                td.textContent = text;
                tr.appendChild(td);
            });

            const tdIncome = document.createElement('td');
            tdIncome.textContent = `${formatCurrency(incomeVal)} đ`;
            tdIncome.style.fontWeight = '600';
            tdIncome.style.color = 'inherit';
            tr.appendChild(tdIncome);

            tbody.appendChild(tr);
        });
    };

    renderTable('warningLowTable', lowIncomeData);
    renderTable('warningHighTable', highIncomeData);
}

function renderTenureTurnoverChart() {
    // Only resigned
    const resignedData = rawData.filter(r => (r['Trạng thái'] || '').includes('Nghỉ việc'));
    
    const tenureCount = {};
    resignedData.forEach(row => {
        const tenure = row['Phân loại thâm niên'] || 'Chưa phân loại';
        tenureCount[tenure] = (tenureCount[tenure] || 0) + 1;
    });

    // Sort by count desc
    const sortedTenures = Object.entries(tenureCount).sort((a, b) => b[1] - a[1]);

    const ctx = document.getElementById('tenureTurnoverChart').getContext('2d');
    if (tenureTurnoverChartInstance) tenureTurnoverChartInstance.destroy();

    tenureTurnoverChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedTenures.map(item => item[0]),
            datasets: [{
                label: 'Số người nghỉ việc',
                data: sortedTenures.map(item => item[1]),
                backgroundColor: '#ec4899', // Pink color
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function renderPercentileReport(incomeCol) {
    if (rawData.length === 0 || !incomeCol) return;

    // Filter valid income rows
    const validData = rawData.filter(row => row[incomeCol] && !isNaN(parseFloat(row[incomeCol])));
    
    // Sort by income ascending
    validData.sort((a, b) => parseFloat(a[incomeCol]) - parseFloat(b[incomeCol]));
    
    if (validData.length === 0) return;

    const percentiles = [10, 25, 50, 75, 90, 95, 99, 100];
    const groupNames = ['Dưới P10', 'P10 - P25', 'P25 - P50', 'P50 - P75', 'P75 - P90', 'P90 - P95', 'P95 - P99', 'P99 - P100'];
    
    const results = [];
    let startIdx = 0;
    const total = validData.length;

    for (let i = 0; i < percentiles.length; i++) {
        let endIdx = Math.floor((percentiles[i] / 100.0) * total);
        if (endIdx === startIdx) endIdx += 1;
        
        const groupData = validData.slice(startIdx, endIdx);
        
        if (groupData.length > 0) {
            const count = groupData.length;
            const avgIncome = groupData.reduce((sum, row) => sum + parseFloat(row[incomeCol]), 0) / count;
            const maxIncome = Math.max(...groupData.map(row => parseFloat(row[incomeCol])));
            
            const resignedCount = groupData.filter(row => (row['Trạng thái'] || '').includes('Nghỉ việc')).length;
            const turnoverRate = (resignedCount / count) * 100;
            
            results.push({
                groupName: groupNames[i],
                count: count,
                avgIncome: avgIncome,
                maxIncome: maxIncome,
                turnoverRate: turnoverRate
            });
        }
        startIdx = endIdx;
    }

    // Render Table (Security Update: Avoid innerHTML)
    const tbody = document.querySelector('#percentileTable tbody');
    tbody.replaceChildren(); // Safely clear children
    
    results.forEach(row => {
        const tr = document.createElement('tr');
        
        // Format Currency
        const formatCurrency = (val) => new Intl.NumberFormat('vi-VN').format(Math.round(val));
        
        // Badge color for turnover
        let badgeClass = 'badge-success';
        if (row.turnoverRate > 50) badgeClass = 'badge-warning';
        if (row.turnoverRate > 80) badgeClass = 'badge-danger';

        // Column 1: Group Name
        const tdGroup = document.createElement('td');
        tdGroup.style.fontWeight = '500';
        tdGroup.style.color = 'var(--accent-blue)';
        tdGroup.textContent = row.groupName;
        tr.appendChild(tdGroup);

        // Column 2: Count
        const tdCount = document.createElement('td');
        tdCount.textContent = row.count.toString();
        tr.appendChild(tdCount);

        // Column 3: Avg Income
        const tdAvgIncome = document.createElement('td');
        tdAvgIncome.textContent = `${formatCurrency(row.avgIncome)} đ`;
        tr.appendChild(tdAvgIncome);

        // Column 5: Max Income
        const tdMaxIncome = document.createElement('td');
        tdMaxIncome.textContent = `${formatCurrency(row.maxIncome)} đ`;
        tr.appendChild(tdMaxIncome);

        // Column 6: Turnover Rate
        const tdTurnover = document.createElement('td');
        const spanBadge = document.createElement('span');
        spanBadge.className = `badge ${badgeClass}`;
        spanBadge.textContent = `${row.turnoverRate.toFixed(1)}%`;
        tdTurnover.appendChild(spanBadge);
        tr.appendChild(tdTurnover);

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
