/* =========================================================
   買っちゃった / 耐えたリスト - script.js
   データ保存(localStorage) / タブ切り替え / 記録・確認・計画 の処理
   ========================================================= */

(function () {
  "use strict";

  var STORAGE_ENTRIES = "wasteListEntries";
  var STORAGE_TAGS = "wasteListTags";
  var STORAGE_PLAN = "wasteListPlan";

  var TYPE_LABEL = { wasted: "買っちゃった", endured: "耐えた" };

  /* ---------------------------------------------------------
     データ読み書き
  --------------------------------------------------------- */

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.error("読み込みエラー:", key, e);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("保存エラー:", key, e);
      return false;
    }
  }

  var entries = loadJSON(STORAGE_ENTRIES, []);
  var tags = loadJSON(STORAGE_TAGS, []); // [{id, name}]
  var plan = loadJSON(STORAGE_PLAN, null); // {name, targetAmount, deadline, reward, subtractWasted}

  function saveEntries() { saveJSON(STORAGE_ENTRIES, entries); }
  function saveTags() { saveJSON(STORAGE_TAGS, tags); }
  function savePlan() { saveJSON(STORAGE_PLAN, plan); }

  /* ---------------------------------------------------------
     共通ユーティリティ
  --------------------------------------------------------- */

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatYen(n) {
    var v = Math.round(n || 0);
    var sign = v < 0 ? "-" : "";
    return sign + "¥" + Math.abs(v).toLocaleString("ja-JP");
  }

  function formatYenPlain(n) {
    var v = Math.round(n || 0);
    return v.toLocaleString("ja-JP") + "円";
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toDatetimeLocalValue(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function toDatetimeDisplay(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function tagNameById(id) {
    var t = tags.find(function (t) { return t.id === id; });
    return t ? t.name : null;
  }

  /* ---------------------------------------------------------
     トースト通知
  --------------------------------------------------------- */

  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1800);
  }

  /* ---------------------------------------------------------
     タブ切り替え
  --------------------------------------------------------- */

  var tabButtons = document.querySelectorAll(".tab-bar .tab-btn");
  var tabPanels = document.querySelectorAll(".tab-content > .tab-panel");

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-tab");
      tabButtons.forEach(function (b) { b.classList.toggle("is-active", b === btn); });
      tabPanels.forEach(function (p) { p.classList.toggle("is-active", p.id === "tab-" + target); });

      if (target === "check") renderCheckTab();
      if (target === "plan") renderPlanTab();
      if (target === "record") renderRecentEntries();
    });
  });

  /* ---------------------------------------------------------
     タグチップ描画（共通）
  --------------------------------------------------------- */

  function renderTagChipSelect(containerEl, selectedIds) {
    containerEl.innerHTML = "";
    tags.forEach(function (tag) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip" + (selectedIds.indexOf(tag.id) !== -1 ? " is-selected" : "");
      chip.textContent = tag.name;
      chip.setAttribute("data-tag-id", tag.id);
      chip.addEventListener("click", function () {
        var idx = selectedIds.indexOf(tag.id);
        if (idx === -1) {
          selectedIds.push(tag.id);
        } else {
          selectedIds.splice(idx, 1);
        }
        chip.classList.toggle("is-selected");
      });
      containerEl.appendChild(chip);
    });
  }

  /* ---------------------------------------------------------
     記録タブ：区分選択・フォーム
  --------------------------------------------------------- */

  var typeSelect = document.getElementById("typeSelect");
  var entryForm = document.getElementById("entryForm");
  var selectedTypeChip = document.getElementById("selectedTypeChip");
  var entryDatetime = document.getElementById("entryDatetime");
  var entryItemName = document.getElementById("entryItemName");
  var entryPlace = document.getElementById("entryPlace");
  var entryAmount = document.getElementById("entryAmount");
  var entryTagSelect = document.getElementById("entryTagSelect");
  var tagEmptyHint = document.getElementById("tagEmptyHint");
  var entryCancelBtn = document.getElementById("entryCancelBtn");
  var openTagManageBtn = document.getElementById("openTagManageBtn");

  var currentEntryType = null;
  var newEntryTagIds = [];

  typeSelect.addEventListener("click", function (e) {
    var btn = e.target.closest(".type-btn");
    if (!btn) return;
    currentEntryType = btn.getAttribute("data-type");

    typeSelect.querySelectorAll(".type-btn").forEach(function (b) {
      b.classList.toggle("is-selected", b === btn);
    });

    selectedTypeChip.textContent = TYPE_LABEL[currentEntryType];
    selectedTypeChip.className = "selected-type-chip type-" + currentEntryType;

    entryDatetime.value = toDatetimeLocalValue(new Date());
    newEntryTagIds = [];
    renderTagChipSelect(entryTagSelect, newEntryTagIds);
    tagEmptyHint.hidden = tags.length > 0;

    entryForm.hidden = false;
  });

  entryCancelBtn.addEventListener("click", resetEntryForm);

  function resetEntryForm() {
    currentEntryType = null;
    entryForm.hidden = true;
    entryForm.reset();
    newEntryTagIds = [];
    typeSelect.querySelectorAll(".type-btn").forEach(function (b) {
      b.classList.remove("is-selected");
    });
  }

  entryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!currentEntryType) return;

    var amount = parseInt(entryAmount.value, 10);
    if (isNaN(amount) || amount < 0) {
      showToast("金額を正しく入力してください");
      return;
    }

    var dtVal = entryDatetime.value ? new Date(entryDatetime.value) : new Date();

    var entry = {
      id: genId(),
      type: currentEntryType,
      datetime: dtVal.toISOString(),
      itemName: entryItemName.value.trim(),
      place: entryPlace.value.trim(),
      amount: amount,
      tags: newEntryTagIds.slice()
    };

    entries.unshift(entry);
    saveEntries();

    showToast(TYPE_LABEL[currentEntryType] + "を記録しました");
    resetEntryForm();
    renderRecentEntries();
  });

  /* ---------------------------------------------------------
     記録タブ：最近の記録一覧
  --------------------------------------------------------- */

  var recentEntryList = document.getElementById("recentEntryList");
  var recentEmptyState = document.getElementById("recentEmptyState");

  function sortedEntriesDesc() {
    return entries.slice().sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });
  }

  function renderRecentEntries() {
    var list = sortedEntriesDesc().slice(0, 10);
    recentEntryList.innerHTML = "";

    if (list.length === 0) {
      recentEmptyState.hidden = false;
      return;
    }
    recentEmptyState.hidden = true;

    list.forEach(function (en) {
      recentEntryList.appendChild(buildRecentEntryCard(en));
    });
  }

  function buildRecentEntryCard(en) {
    var card = document.createElement("div");
    card.className = "recent-entry-card";

    var top = document.createElement("div");
    top.className = "recent-entry-top";

    var typeTag = document.createElement("span");
    typeTag.className = "recent-entry-tag-type type-" + en.type;
    typeTag.textContent = TYPE_LABEL[en.type];

    var dt = document.createElement("span");
    dt.className = "recent-entry-datetime";
    dt.textContent = toDatetimeDisplay(en.datetime);

    top.appendChild(typeTag);
    top.appendChild(dt);

    var main = document.createElement("div");
    main.className = "recent-entry-main";

    var nameWrap = document.createElement("div");
    var nameEl = document.createElement("div");
    nameEl.className = "recent-entry-name";
    nameEl.textContent = en.itemName || "（品名未入力）";
    var placeEl = document.createElement("div");
    placeEl.className = "recent-entry-place";
    placeEl.textContent = en.place || "";
    nameWrap.appendChild(nameEl);
    if (en.place) nameWrap.appendChild(placeEl);

    var amountEl = document.createElement("div");
    amountEl.className = "recent-entry-amount type-" + en.type;
    amountEl.textContent = formatYenPlain(en.amount);

    main.appendChild(nameWrap);
    main.appendChild(amountEl);

    card.appendChild(top);
    card.appendChild(main);

    if (en.tags && en.tags.length > 0) {
      var tagsWrap = document.createElement("div");
      tagsWrap.className = "recent-entry-tags";
      en.tags.forEach(function (tid) {
        var name = tagNameById(tid);
        if (!name) return;
        var pill = document.createElement("span");
        pill.className = "recent-entry-tag-pill";
        pill.textContent = name;
        tagsWrap.appendChild(pill);
      });
      if (tagsWrap.children.length > 0) card.appendChild(tagsWrap);
    }

    var actions = document.createElement("div");
    actions.className = "recent-entry-actions";

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", function () { openEditModal(en.id); });

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", function () { deleteEntry(en.id); });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);

    return card;
  }

  function deleteEntry(id) {
    if (!confirm("この記録を削除しますか？")) return;
    entries = entries.filter(function (en) { return en.id !== id; });
    saveEntries();
    renderRecentEntries();
    showToast("削除しました");
  }

  /* ---------------------------------------------------------
     記録編集モーダル
  --------------------------------------------------------- */

  var editEntryModal = document.getElementById("editEntryModal");
  var editTypeSelect = document.getElementById("editTypeSelect");
  var editDatetime = document.getElementById("editDatetime");
  var editItemName = document.getElementById("editItemName");
  var editPlace = document.getElementById("editPlace");
  var editAmount = document.getElementById("editAmount");
  var editTagSelect = document.getElementById("editTagSelect");
  var editCancelBtn = document.getElementById("editCancelBtn");
  var editSaveBtn = document.getElementById("editSaveBtn");

  var editingId = null;
  var editingType = null;
  var editEntryTagIds = [];

  function openEditModal(id) {
    var en = entries.find(function (e) { return e.id === id; });
    if (!en) return;

    editingId = id;
    editingType = en.type;
    editEntryTagIds = (en.tags || []).slice();

    editDatetime.value = toDatetimeLocalValue(new Date(en.datetime));
    editItemName.value = en.itemName || "";
    editPlace.value = en.place || "";
    editAmount.value = en.amount;

    editTypeSelect.querySelectorAll(".type-btn").forEach(function (b) {
      b.classList.toggle("is-selected", b.getAttribute("data-type") === editingType);
    });

    renderTagChipSelect(editTagSelect, editEntryTagIds);

    editEntryModal.hidden = false;
  }

  editTypeSelect.addEventListener("click", function (e) {
    var btn = e.target.closest(".type-btn");
    if (!btn) return;
    editingType = btn.getAttribute("data-type");
    editTypeSelect.querySelectorAll(".type-btn").forEach(function (b) {
      b.classList.toggle("is-selected", b === btn);
    });
  });

  editCancelBtn.addEventListener("click", closeEditModal);
  editEntryModal.addEventListener("click", function (e) {
    if (e.target === editEntryModal) closeEditModal();
  });

  function closeEditModal() {
    editEntryModal.hidden = true;
    editingId = null;
  }

  editSaveBtn.addEventListener("click", function () {
    var amount = parseInt(editAmount.value, 10);
    if (isNaN(amount) || amount < 0) {
      showToast("金額を正しく入力してください");
      return;
    }
    var en = entries.find(function (e) { return e.id === editingId; });
    if (!en) return;

    en.type = editingType;
    en.datetime = editDatetime.value ? new Date(editDatetime.value).toISOString() : en.datetime;
    en.itemName = editItemName.value.trim();
    en.place = editPlace.value.trim();
    en.amount = amount;
    en.tags = editEntryTagIds.slice();

    saveEntries();
    closeEditModal();
    renderRecentEntries();
    showToast("更新しました");
  });

  /* ---------------------------------------------------------
     タグ管理モーダル
  --------------------------------------------------------- */

  var tagManageModal = document.getElementById("tagManageModal");
  var tagManageList = document.getElementById("tagManageList");
  var tagManageEmpty = document.getElementById("tagManageEmpty");
  var newTagInput = document.getElementById("newTagInput");
  var addTagBtn = document.getElementById("addTagBtn");
  var tagManageCloseBtn = document.getElementById("tagManageCloseBtn");

  openTagManageBtn.addEventListener("click", function () {
    renderTagManageList();
    tagManageModal.hidden = false;
  });

  tagManageCloseBtn.addEventListener("click", function () {
    tagManageModal.hidden = true;
    // 記録フォームのタグ選択を最新状態で再描画
    if (!entryForm.hidden) {
      renderTagChipSelect(entryTagSelect, newEntryTagIds);
      tagEmptyHint.hidden = tags.length > 0;
    }
  });

  tagManageModal.addEventListener("click", function (e) {
    if (e.target === tagManageModal) tagManageModal.hidden = true;
  });

  function renderTagManageList() {
    tagManageList.innerHTML = "";
    if (tags.length === 0) {
      tagManageEmpty.hidden = false;
      return;
    }
    tagManageEmpty.hidden = true;

    tags.forEach(function (tag) {
      var row = document.createElement("div");
      row.className = "tag-manage-row";

      var nameEl = document.createElement("span");
      nameEl.className = "tag-manage-name";
      nameEl.textContent = tag.name;

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "tag-manage-delete";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", function () {
        if (!confirm("「" + tag.name + "」を削除しますか？既存の記録からも外れます。")) return;
        tags = tags.filter(function (t) { return t.id !== tag.id; });
        entries.forEach(function (en) {
          en.tags = (en.tags || []).filter(function (tid) { return tid !== tag.id; });
        });
        saveTags();
        saveEntries();
        renderTagManageList();
        showToast("タグを削除しました");
      });

      row.appendChild(nameEl);
      row.appendChild(delBtn);
      tagManageList.appendChild(row);
    });
  }

  addTagBtn.addEventListener("click", function () {
    var name = newTagInput.value.trim();
    if (!name) return;
    var exists = tags.some(function (t) { return t.name === name; });
    if (exists) {
      showToast("同じ名前のタグがすでにあります");
      return;
    }
    tags.push({ id: genId(), name: name });
    saveTags();
    newTagInput.value = "";
    renderTagManageList();
    showToast("タグを追加しました");
  });

  /* ---------------------------------------------------------
     確認タブ：期間管理
  --------------------------------------------------------- */

  var periodToggle = document.getElementById("periodToggle");
  var periodPrevBtn = document.getElementById("periodPrevBtn");
  var periodNextBtn = document.getElementById("periodNextBtn");
  var periodLabel = document.getElementById("periodLabel");
  var graphTypeToggle = document.getElementById("graphTypeToggle");

  var today = new Date();
  var checkPeriodMode = "month"; // "month" | "year"
  var checkYear = today.getFullYear();
  var checkMonth = today.getMonth(); // 0-11
  var currentGraphType = "endured"; // "endured" | "wasted" | "diff"

  periodToggle.addEventListener("click", function (e) {
    var btn = e.target.closest(".seg-btn");
    if (!btn) return;
    checkPeriodMode = btn.getAttribute("data-period");
    periodToggle.querySelectorAll(".seg-btn").forEach(function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    renderCheckTab();
  });

  periodPrevBtn.addEventListener("click", function () {
    if (checkPeriodMode === "month") {
      checkMonth -= 1;
      if (checkMonth < 0) { checkMonth = 11; checkYear -= 1; }
    } else {
      checkYear -= 1;
    }
    renderCheckTab();
  });

  periodNextBtn.addEventListener("click", function () {
    if (checkPeriodMode === "month") {
      checkMonth += 1;
      if (checkMonth > 11) { checkMonth = 0; checkYear += 1; }
    } else {
      checkYear += 1;
    }
    renderCheckTab();
  });

  graphTypeToggle.addEventListener("click", function (e) {
    var btn = e.target.closest(".mini-seg-btn");
    if (!btn) return;
    currentGraphType = btn.getAttribute("data-graph");
    graphTypeToggle.querySelectorAll(".mini-seg-btn").forEach(function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    renderCheckTab();
  });

  function entriesInPeriod() {
    return entries.filter(function (en) {
      var d = new Date(en.datetime);
      if (checkPeriodMode === "month") {
        return d.getFullYear() === checkYear && d.getMonth() === checkMonth;
      }
      return d.getFullYear() === checkYear;
    });
  }

  /* ---------------------------------------------------------
     確認タブ：描画
  --------------------------------------------------------- */

  var summaryWastedEl = document.getElementById("summaryWasted");
  var summaryEnduredEl = document.getElementById("summaryEndured");
  var summaryDiffEl = document.getElementById("summaryDiff");
  var chartWrapper = document.getElementById("chartWrapper");
  var tagSummaryTable = document.getElementById("tagSummaryTable");
  var tagSummaryEmpty = document.getElementById("tagSummaryEmpty");

  function renderCheckTab() {
    var periodEntries = entriesInPeriod();

    // 期間ラベル
    periodLabel.textContent = checkPeriodMode === "month"
      ? (checkYear + "年" + (checkMonth + 1) + "月")
      : (checkYear + "年");

    // サマリー
    var totalWasted = 0, totalEndured = 0;
    periodEntries.forEach(function (en) {
      if (en.type === "wasted") totalWasted += en.amount;
      else totalEndured += en.amount;
    });
    summaryWastedEl.textContent = formatYen(totalWasted);
    summaryEnduredEl.textContent = formatYen(totalEndured);
    summaryDiffEl.textContent = formatYen(totalEndured - totalWasted);

    // グラフ用データ（日別 or 月別）
    var categories, wastedByBucket, enduredByBucket;

    if (checkPeriodMode === "month") {
      var daysInMonth = new Date(checkYear, checkMonth + 1, 0).getDate();
      categories = [];
      wastedByBucket = new Array(daysInMonth).fill(0);
      enduredByBucket = new Array(daysInMonth).fill(0);
      for (var d = 1; d <= daysInMonth; d++) categories.push(String(d));

      periodEntries.forEach(function (en) {
        var dt = new Date(en.datetime);
        var idx = dt.getDate() - 1;
        if (en.type === "wasted") wastedByBucket[idx] += en.amount;
        else enduredByBucket[idx] += en.amount;
      });
    } else {
      categories = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
      wastedByBucket = new Array(12).fill(0);
      enduredByBucket = new Array(12).fill(0);

      periodEntries.forEach(function (en) {
        var dt = new Date(en.datetime);
        var idx = dt.getMonth();
        if (en.type === "wasted") wastedByBucket[idx] += en.amount;
        else enduredByBucket[idx] += en.amount;
      });
    }

    var barValues, cumulativeValues, barColorMode;
    if (currentGraphType === "endured") {
      barValues = enduredByBucket;
      barColorMode = "endured";
    } else if (currentGraphType === "wasted") {
      barValues = wastedByBucket;
      barColorMode = "wasted";
    } else {
      barValues = enduredByBucket.map(function (v, i) { return v - wastedByBucket[i]; });
      barColorMode = "diff";
    }

    var running = 0;
    cumulativeValues = barValues.map(function (v) { running += v; return running; });

    renderChart(categories, barValues, cumulativeValues, barColorMode);

    // タグ別集計
    renderTagSummary(periodEntries);
  }

  function renderTagSummary(periodEntries) {
    var totals = {}; // tagId -> {wasted, endured}
    periodEntries.forEach(function (en) {
      (en.tags || []).forEach(function (tid) {
        if (!totals[tid]) totals[tid] = { wasted: 0, endured: 0 };
        totals[tid][en.type] += en.amount;
      });
    });

    var tagIds = Object.keys(totals);
    tagSummaryTable.innerHTML = "";

    if (tagIds.length === 0) {
      tagSummaryEmpty.hidden = false;
      return;
    }
    tagSummaryEmpty.hidden = true;

    // 合計額（買っちゃった+耐えた）の多い順に並べる
    tagIds.sort(function (a, b) {
      var sa = totals[a].wasted + totals[a].endured;
      var sb = totals[b].wasted + totals[b].endured;
      return sb - sa;
    });

    tagIds.forEach(function (tid) {
      var name = tagNameById(tid);
      if (!name) return;
      var t = totals[tid];

      var row = document.createElement("div");
      row.className = "tag-summary-row";

      var nameEl = document.createElement("span");
      nameEl.className = "tag-summary-name";
      nameEl.textContent = name;

      var amountsEl = document.createElement("span");
      amountsEl.className = "tag-summary-amounts";
      amountsEl.innerHTML =
        '<span class="wasted-amt">買 ' + escapeHtml(formatYen(t.wasted)) + '</span>' +
        '<span class="endured-amt">耐 ' + escapeHtml(formatYen(t.endured)) + '</span>';

      row.appendChild(nameEl);
      row.appendChild(amountsEl);
      tagSummaryTable.appendChild(row);
    });
  }

  /* ---------------------------------------------------------
     SVGチャート描画（棒グラフ＋累計折れ線）
  --------------------------------------------------------- */

  function seriesStats(values) {
    var maxPos = 0, maxNeg = 0;
    values.forEach(function (v) {
      if (v > maxPos) maxPos = v;
      if (-v > maxNeg) maxNeg = -v;
    });
    return { maxPos: maxPos, maxNeg: maxNeg };
  }

  function renderChart(categories, barValues, lineValues, colorMode) {
    var n = categories.length;
    var width = 320;
    var plotTop = 12, plotBottom = 128, labelY = 148;
    var plotLeft = 6, plotRight = width - 6;
    var height = 160;

    var barStats = seriesStats(barValues);
    var lineStats = seriesStats(lineValues);
    var hasNeg = barStats.maxNeg > 0 || lineStats.maxNeg > 0;

    var zeroY = hasNeg ? (plotTop + plotBottom) / 2 : plotBottom;
    var topSpan = zeroY - plotTop;
    var bottomSpan = plotBottom - zeroY;

    function valueToY(v, stats) {
      if (v >= 0) {
        var max = stats.maxPos || 1;
        return zeroY - (v / max) * topSpan;
      } else {
        var maxN = stats.maxNeg || 1;
        return zeroY + (Math.abs(v) / maxN) * bottomSpan;
      }
    }

    var slotWidth = (plotRight - plotLeft) / n;
    var barWidth = Math.max(2, slotWidth * 0.55);

    function xCenter(i) { return plotLeft + slotWidth * (i + 0.5); }

    function barColor(v) {
      if (colorMode === "endured") return "var(--endured)";
      if (colorMode === "wasted") return "var(--wasted)";
      return v >= 0 ? "var(--diff-plus)" : "var(--diff-minus)";
    }

    var svgParts = [];
    svgParts.push('<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">');

    // 0ライン（負の値がある場合のみ表示）
    if (hasNeg) {
      svgParts.push('<line x1="' + plotLeft + '" y1="' + zeroY + '" x2="' + plotRight + '" y2="' + zeroY +
        '" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3" />');
    }

    // 棒グラフ
    for (var i = 0; i < n; i++) {
      var v = barValues[i];
      var y0 = zeroY;
      var y1 = valueToY(v, barStats);
      var rectY = Math.min(y0, y1);
      var rectH = Math.max(1, Math.abs(y1 - y0));
      var cx = xCenter(i);
      svgParts.push('<rect x="' + (cx - barWidth / 2).toFixed(1) + '" y="' + rectY.toFixed(1) +
        '" width="' + barWidth.toFixed(1) + '" height="' + rectH.toFixed(1) +
        '" rx="2" fill="' + barColor(v) + '" />');
    }

    // 累計折れ線
    var linePoints = [];
    for (var j = 0; j < n; j++) {
      linePoints.push(xCenter(j).toFixed(1) + "," + valueToY(lineValues[j], lineStats).toFixed(1));
    }
    svgParts.push('<polyline points="' + linePoints.join(" ") +
      '" fill="none" stroke="var(--line-color)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />');

    for (var k = 0; k < n; k++) {
      svgParts.push('<circle cx="' + xCenter(k).toFixed(1) + '" cy="' + valueToY(lineValues[k], lineStats).toFixed(1) +
        '" r="2.2" fill="var(--line-color)" />');
    }

    // ラベル（間引き表示）
    var labelStep = n <= 12 ? 1 : Math.ceil(n / 6);
    for (var m = 0; m < n; m++) {
      if (m % labelStep !== 0 && m !== n - 1) continue;
      svgParts.push('<text x="' + xCenter(m).toFixed(1) + '" y="' + labelY +
        '" font-size="9" fill="var(--ink-soft)" text-anchor="middle">' + escapeHtml(categories[m]) + '</text>');
    }

    svgParts.push('</svg>');
    chartWrapper.innerHTML = svgParts.join("");
  }

  /* ---------------------------------------------------------
     計画タブ
  --------------------------------------------------------- */

  var planProgressBlock = document.getElementById("planProgressBlock");
  var planEmptyState = document.getElementById("planEmptyState");
  var planNameDisplay = document.getElementById("planNameDisplay");
  var planProgressBar = document.getElementById("planProgressBar");
  var planProgressPercent = document.getElementById("planProgressPercent");
  var planProgressAmounts = document.getElementById("planProgressAmounts");
  var planDeadlineText = document.getElementById("planDeadlineText");
  var planRewardText = document.getElementById("planRewardText");
  var planSettingsBtn = document.getElementById("planSettingsBtn");
  var planChartWrapper = document.getElementById("planChartWrapper");
  var planDeleteBtn = document.getElementById("planDeleteBtn");

  var planForm = document.getElementById("planForm");
  var planNameInput = document.getElementById("planName");
  var planTargetAmountInput = document.getElementById("planTargetAmount");
  var planDeadlineInput = document.getElementById("planDeadline");
  var planRewardInput = document.getElementById("planReward");
  var planSubtractWastedInput = document.getElementById("planSubtractWasted");

  planSettingsBtn.addEventListener("click", function () {
    planForm.hidden = !planForm.hidden;
  });

  planDeleteBtn.addEventListener("click", function () {
    if (!plan) return;
    if (!confirm("計画「" + plan.name + "」を削除しますか？")) return;
    plan = null;
    savePlan();
    renderPlanTab();
    showToast("計画を削除しました");
  });

  function renderPlanTab() {
    if (!plan) {
      planProgressBlock.hidden = true;
      planEmptyState.hidden = false;
      planSettingsBtn.hidden = true;
      planDeleteBtn.hidden = true;
      planForm.hidden = false;
      planForm.reset();
      planSubtractWastedInput.checked = true;
      return;
    }

    planEmptyState.hidden = true;
    planProgressBlock.hidden = false;
    planSettingsBtn.hidden = false;
    planDeleteBtn.hidden = false;
    // 設定済みの場合はフォームを畳んでおき、歯車ボタンで再表示する
    planForm.hidden = true;

    // フォームに現在値を反映（再設定時に編集しやすいように）
    planNameInput.value = plan.name;
    planTargetAmountInput.value = plan.targetAmount;
    planDeadlineInput.value = plan.deadline || "";
    planRewardInput.value = plan.reward || "";
    planSubtractWastedInput.checked = !!plan.subtractWasted;

    var totalEndured = 0, totalWasted = 0;
    entries.forEach(function (en) {
      if (en.type === "endured") totalEndured += en.amount;
      else totalWasted += en.amount;
    });

    var progressAmount = plan.subtractWasted ? (totalEndured - totalWasted) : totalEndured;
    var target = plan.targetAmount || 0;
    var pct = target > 0 ? Math.max(0, Math.min(100, (progressAmount / target) * 100)) : 0;

    planNameDisplay.textContent = plan.name;
    planProgressBar.style.width = pct.toFixed(1) + "%";
    planProgressPercent.textContent = Math.round(pct) + "%";

    var remaining = Math.max(target - progressAmount, 0);
    planProgressAmounts.textContent =
      formatYen(Math.max(progressAmount, 0)) + " / " + formatYen(target) +
      "（残り " + formatYen(remaining) + "）";

    if (plan.deadline) {
      var deadlineDate = new Date(plan.deadline + "T00:00:00");
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      var diffDays = Math.round((deadlineDate - now) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        planDeadlineText.textContent = "納期まであと " + diffDays + " 日";
      } else if (diffDays === 0) {
        planDeadlineText.textContent = "納期は本日です";
      } else {
        planDeadlineText.textContent = "納期を " + Math.abs(diffDays) + " 日過ぎています";
      }
    } else {
      planDeadlineText.textContent = "";
    }

    planRewardText.textContent = plan.reward ? "🎁 " + plan.reward : "";

    renderPlanChart(target);
  }

  /* ---------------------------------------------------------
     計画タブ：目標達成までの進捗グラフ（直近12ヶ月の累計推移）
  --------------------------------------------------------- */

  function renderPlanChart(target) {
    if (entries.length === 0) {
      planChartWrapper.innerHTML = '<p class="empty-state">記録がまだありません</p>';
      return;
    }

    // 直近12ヶ月分の年月バケットを生成
    var months = [];
    var base = new Date(today.getFullYear(), today.getMonth(), 1);
    for (var i = 11; i >= 0; i--) {
      var d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }

    function contribution(en) {
      if (en.type === "endured") return en.amount;
      return plan.subtractWasted ? -en.amount : 0;
    }

    var windowStart = new Date(months[0].year, months[0].month, 1);

    var baseline = 0;
    var monthlyDelta = months.map(function () { return 0; });

    entries.forEach(function (en) {
      var d = new Date(en.datetime);
      var c = contribution(en);
      if (d < windowStart) {
        baseline += c;
        return;
      }
      var idx = months.findIndex(function (m) { return m.year === d.getFullYear() && m.month === d.getMonth(); });
      if (idx !== -1) monthlyDelta[idx] += c;
    });

    var running = baseline;
    var cumulative = monthlyDelta.map(function (delta) {
      running += delta;
      return running;
    });

    var categories = months.map(function (m) {
      return (m.year % 100) + "/" + (m.month + 1);
    });

    renderLineWithTarget(planChartWrapper, categories, cumulative, target);
  }

  function renderLineWithTarget(containerEl, categories, values, target) {
    var n = categories.length;
    var width = 320, height = 160;
    var plotTop = 12, plotBottom = 128, labelY = 148;
    var plotLeft = 10, plotRight = width - 10;

    var allValues = values.concat([target, 0]);
    var maxV = Math.max.apply(null, allValues);
    var minV = Math.min.apply(null, allValues);
    if (maxV === minV) { maxV += 1; }
    var range = maxV - minV;

    function valueToY(v) {
      return plotBottom - ((v - minV) / range) * (plotBottom - plotTop);
    }

    function xAt(i) {
      return n <= 1 ? (plotLeft + plotRight) / 2 : plotLeft + (plotRight - plotLeft) * (i / (n - 1));
    }

    var svgParts = [];
    svgParts.push('<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">');

    // 目標ライン
    var targetY = valueToY(target);
    svgParts.push('<line x1="' + plotLeft + '" y1="' + targetY.toFixed(1) + '" x2="' + plotRight + '" y2="' + targetY.toFixed(1) +
      '" stroke="var(--wasted-strong)" stroke-width="1.5" stroke-dasharray="4,3" />');
    svgParts.push('<text x="' + plotRight + '" y="' + (targetY - 4).toFixed(1) +
      '" font-size="9" fill="var(--wasted-strong)" text-anchor="end">目標 ' + escapeHtml(formatYen(target)) + '</text>');

    // 累計推移ライン
    var points = [];
    for (var i = 0; i < n; i++) points.push(xAt(i).toFixed(1) + "," + valueToY(values[i]).toFixed(1));
    svgParts.push('<polyline points="' + points.join(" ") +
      '" fill="none" stroke="var(--endured)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />');

    for (var j = 0; j < n; j++) {
      svgParts.push('<circle cx="' + xAt(j).toFixed(1) + '" cy="' + valueToY(values[j]).toFixed(1) +
        '" r="2.4" fill="var(--endured)" />');
    }

    var labelStep = n <= 6 ? 1 : Math.ceil(n / 6);
    for (var m = 0; m < n; m++) {
      if (m % labelStep !== 0 && m !== n - 1) continue;
      svgParts.push('<text x="' + xAt(m).toFixed(1) + '" y="' + labelY +
        '" font-size="9" fill="var(--ink-soft)" text-anchor="middle">' + escapeHtml(categories[m]) + '</text>');
    }

    svgParts.push('</svg>');
    containerEl.innerHTML = svgParts.join("");
  }

  planForm.addEventListener("submit", function (e) {
    e.preventDefault();

    var target = parseInt(planTargetAmountInput.value, 10);
    if (isNaN(target) || target < 0) {
      showToast("目標金額を正しく入力してください");
      return;
    }

    plan = {
      name: planNameInput.value.trim() || "無題の計画",
      targetAmount: target,
      deadline: planDeadlineInput.value || "",
      reward: planRewardInput.value.trim(),
      subtractWasted: planSubtractWastedInput.checked
    };

    savePlan();
    renderPlanTab();
    showToast("計画を保存しました");
  });

  /* ---------------------------------------------------------
     初期表示
  --------------------------------------------------------- */

  renderRecentEntries();

})();
