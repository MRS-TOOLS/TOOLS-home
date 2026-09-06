// ===================== 共通 =====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabName === 'single') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('single-tab').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('multi-tab').classList.add('active');
    }
}

function formatTime(ms, withMs = true) {
    const totalMs = Math.max(0, ms);
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const cs = Math.floor((totalMs % 1000) / 10);

    let main;
    if (h > 0) {
        main = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } else {
        main = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    if (!withMs) return main;
    return { main, cs: String(cs).padStart(2, '0') };
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
}

// ===================== シングル =====================
let single = {
    running: false,
    startTs: 0,
    accumulatedMs: 0,
    intervalId: null,
    laps: [] // { totalMs, lapMs }
};

function getSingleElapsed() {
    if (single.running) {
        return single.accumulatedMs + (Date.now() - single.startTs);
    }
    return single.accumulatedMs;
}

function renderSingleDisplay() {
    const el = document.getElementById('single-display');
    const t = formatTime(getSingleElapsed());
    el.innerHTML = `${t.main}<span class="ms-part">.${t.cs}</span>`;
}

function toggleSingle() {
    const startBtn = document.getElementById('single-start-btn');
    const lapBtn = document.getElementById('single-lap-btn');
    const resetBtn = document.getElementById('single-reset-btn');

    if (single.running) {
        single.accumulatedMs = getSingleElapsed();
        single.running = false;
        clearInterval(single.intervalId);

        startBtn.textContent = '再開';
        startBtn.className = 'round-btn btn-big-start';
        lapBtn.disabled = true;
        resetBtn.disabled = false;
    } else {
        single.startTs = Date.now();
        single.running = true;

        startBtn.textContent = 'ストップ';
        startBtn.className = 'round-btn btn-big-pause';
        lapBtn.disabled = false;
        resetBtn.disabled = true;

        single.intervalId = setInterval(renderSingleDisplay, 30);
    }
    renderSingleDisplay();
}

function lapSingle() {
    if (!single.running) return;
    const totalMs = getSingleElapsed();
    const prevTotal = single.laps.length > 0 ? single.laps[single.laps.length - 1].totalMs : 0;
    single.laps.push({ totalMs, lapMs: totalMs - prevTotal });
    renderLaps();
}

function resetSingle() {
    if (single.running) return;
    single.accumulatedMs = 0;
    single.laps = [];
    renderSingleDisplay();
    renderLaps();
    document.getElementById('single-start-btn').textContent = 'スタート';
    document.getElementById('single-reset-btn').disabled = true;
}

function renderLaps() {
    const list = document.getElementById('laps-list');
    list.innerHTML = '';

    if (single.laps.length === 0) {
        list.innerHTML = '<div class="empty-msg">ラップはまだありません</div>';
        return;
    }

    let fastestIdx = -1, slowestIdx = -1;
    if (single.laps.length > 1) {
        let fastest = Infinity, slowest = -Infinity;
        single.laps.forEach((l, i) => {
            if (l.lapMs < fastest) { fastest = l.lapMs; fastestIdx = i; }
            if (l.lapMs > slowest) { slowest = l.lapMs; slowestIdx = i; }
        });
    }

    for (let i = single.laps.length - 1; i >= 0; i--) {
        const lap = single.laps[i];
        const row = document.createElement('div');
        let cls = 'lap-row';
        if (i === fastestIdx) cls += ' fastest';
        if (i === slowestIdx) cls += ' slowest';
        row.className = cls;

        const lapT = formatTime(lap.lapMs);
        const totalT = formatTime(lap.totalMs);

        row.innerHTML = `
            <span class="lap-num">Lap ${i + 1}</span>
            <span class="lap-diff">${lapT.main}.${lapT.cs}</span>
            <span class="lap-total">${totalT.main}.${totalT.cs}</span>
        `;
        list.appendChild(row);
    }
}

// ===================== マルチ =====================
let stopwatches = [];
let swCounter = 1;

function renderStopwatches() {
    const container = document.getElementById('sw-list');
    container.innerHTML = '';

    if (stopwatches.length === 0) {
        container.innerHTML = '<div class="empty-msg">ストップウォッチを追加してください</div>';
        return;
    }

    stopwatches.forEach(sw => {
        const elapsed = sw.running ? sw.accumulatedMs + (Date.now() - sw.startTs) : sw.accumulatedMs;
        const t = formatTime(elapsed);

        const card = document.createElement('div');
        card.className = 'sw-card';
        card.innerHTML = `
            <div class="sw-card-top">
                <input type="text" class="sw-label-input" value="${escapeHtml(sw.label)}"
                    oninput="updateSwLabel(${sw.id}, this.value)">
            </div>
            <div class="sw-card-bottom">
                <div class="sw-time-text">${t.main}<span class="ms-part">.${t.cs}</span></div>
                <div class="sw-controls">
                    <button class="sm-circle-btn ${sw.running ? 'btn-pause' : 'btn-start'}" onclick="toggleSw(${sw.id})">
                        ${sw.running ? 'ストップ' : 'スタート'}
                    </button>
                    <button class="sm-circle-btn btn-reset" onclick="resetSw(${sw.id})">リセット</button>
                    <button class="sm-circle-btn btn-delete" onclick="deleteSw(${sw.id})">✕</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function addStopwatch() {
    const labelInput = document.getElementById('new-sw-label');
    const label = labelInput.value.trim() || `ストップウォッチ ${swCounter}`;
    swCounter++;

    stopwatches.push({
        id: Date.now() + Math.random(),
        label: label,
        running: false,
        startTs: 0,
        accumulatedMs: 0,
        intervalId: null
    });

    labelInput.value = '';
    renderStopwatches();
}

function updateSwLabel(id, value) {
    const sw = stopwatches.find(s => s.id === id);
    if (sw) sw.label = value;
}

function toggleSw(id) {
    const sw = stopwatches.find(s => s.id === id);
    if (!sw) return;

    if (sw.running) {
        sw.accumulatedMs = sw.accumulatedMs + (Date.now() - sw.startTs);
        sw.running = false;
        clearInterval(sw.intervalId);
    } else {
        sw.startTs = Date.now();
        sw.running = true;
        sw.intervalId = setInterval(renderStopwatches, 30);
    }
    renderStopwatches();
}

function resetSw(id) {
    const sw = stopwatches.find(s => s.id === id);
    if (!sw) return;
    clearInterval(sw.intervalId);
    sw.running = false;
    sw.accumulatedMs = 0;
    renderStopwatches();
}

function deleteSw(id) {
    const sw = stopwatches.find(s => s.id === id);
    if (sw) clearInterval(sw.intervalId);
    stopwatches = stopwatches.filter(s => s.id !== id);
    renderStopwatches();
}

// ===================== 初期化 =====================
window.onload = function() {
    renderSingleDisplay();
    renderLaps();
    renderStopwatches();
};
