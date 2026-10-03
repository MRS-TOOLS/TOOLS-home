"use strict";
function exportCounterData() {
    const blob = new Blob([JSON.stringify({ app: 'mrs-multi-counter', version: 1, data: state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `multi-counter-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    document.getElementById('transfer-status').textContent = 'データを書き出しました。保存したファイルを移行先で読み込んでください。';
}
