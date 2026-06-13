/* =========================================================
   筋トレ記録アプリ
   - データはブラウザの localStorage に保存（サーバー不要）
   ========================================================= */

const STORAGE_KEY = "kintore_data_v1";

// 初期データ（部位ごとの種目リスト + 記録）
const DEFAULT_DATA = {
  // 部位 -> 種目名の配列
  exercises: {
    "胸": ["ベンチプレス", "ダンベルフライ"],
    "背中": ["デッドリフト", "ラットプルダウン"],
    "肩": ["ショルダープレス", "サイドレイズ"],
    "腕": ["アームカール", "トライセプスエクステンション"],
    "脚": ["スクワット", "レッグプレス"],
    "腹": ["クランチ", "レッグレイズ"],
  },
  // 記録の配列
  records: [],
};

/* ---------- データ層 ---------- */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    const data = JSON.parse(raw);
    if (!data.exercises) data.exercises = {};
    if (!Array.isArray(data.records)) data.records = [];
    return data;
  } catch (e) {
    console.error("データ読み込み失敗", e);
    return structuredClone(DEFAULT_DATA);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadData();

/* ---------- ユーティリティ ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function todayStr() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* =========================================================
   タブ切り替え
   ========================================================= */
$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    $$(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    $$(".tab-panel").forEach((p) =>
      p.classList.toggle("active", p.id === `tab-${tab}`)
    );
    if (tab === "history") renderHistory();
  });
});

/* =========================================================
   タイマー（ストップウォッチ / インターバル）
   ========================================================= */
const timer = {
  mode: "stopwatch", // or "interval"
  running: false,
  rafId: null,
  startTime: 0,
  elapsed: 0, // ms
  intervalSec: 60, // インターバルの設定秒数
};

const timerDisplay = $("#timerDisplay");
let audioCtx = null;

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    o.start();
    o.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    /* 無音環境では何もしない */
  }
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const sec = String(totalSec % 60).padStart(2, "0");
  const tenths = Math.floor((ms % 1000) / 100);
  return `${min}:${sec}.${tenths}`;
}

function renderTimer() {
  if (timer.mode === "stopwatch") {
    timerDisplay.textContent = formatTime(timer.elapsed);
  } else {
    const remain = Math.max(0, timer.intervalSec * 1000 - timer.elapsed);
    timerDisplay.textContent = formatTime(remain);
    if (remain <= 0 && timer.running) {
      stopTimer();
      timerDisplay.classList.add("finished");
      beep();
      setTimeout(() => beep(), 250);
    }
  }
}

function tick() {
  timer.elapsed = Date.now() - timer.startTime;
  renderTimer();
  if (timer.running) timer.rafId = requestAnimationFrame(tick);
}

function startTimer() {
  if (timer.running) return;
  if (timer.mode === "interval" && timer.elapsed >= timer.intervalSec * 1000) {
    timer.elapsed = 0; // 完了状態からの再スタートはリセット
  }
  timer.running = true;
  timer.startTime = Date.now() - timer.elapsed;
  timerDisplay.classList.remove("finished");
  $("#timerStart").disabled = true;
  $("#timerStop").disabled = false;
  // ユーザー操作内で AudioContext を起こしておく（モバイル対策）
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {}
  tick();
}

function stopTimer() {
  timer.running = false;
  cancelAnimationFrame(timer.rafId);
  $("#timerStart").disabled = false;
  $("#timerStop").disabled = true;
}

function resetTimer() {
  stopTimer();
  timer.elapsed = 0;
  timerDisplay.classList.remove("finished");
  renderTimer();
}

$("#timerStart").addEventListener("click", startTimer);
$("#timerStop").addEventListener("click", stopTimer);
$("#timerReset").addEventListener("click", resetTimer);

// モード切替
$$(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
    timer.mode = btn.dataset.mode;
    $("#intervalPresets").hidden = timer.mode !== "interval";
    resetTimer();
  });
});

// インターバルのプリセット
$$(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    timer.intervalSec = Number(btn.dataset.sec);
    $$(".preset-btn").forEach((b) => b.classList.toggle("active", b === btn));
    resetTimer();
  });
});

$("#setCustomInterval").addEventListener("click", () => {
  const v = Number($("#customInterval").value);
  if (v > 0) {
    timer.intervalSec = v;
    $$(".preset-btn").forEach((b) => b.classList.remove("active"));
    resetTimer();
  }
});

/* =========================================================
   汎用モーダル（部位 / 種目 の名前入力）
   ========================================================= */
function promptModal(title, placeholder = "") {
  return new Promise((resolve) => {
    const modal = $("#modal");
    const input = $("#modalInput");
    $("#modalTitle").textContent = title;
    input.value = "";
    input.placeholder = placeholder;
    modal.hidden = false;
    setTimeout(() => input.focus(), 50);

    const cleanup = () => {
      modal.hidden = true;
      $("#modalOk").onclick = null;
      $("#modalCancel").onclick = null;
      input.onkeydown = null;
    };
    const ok = () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    };
    $("#modalOk").onclick = ok;
    $("#modalCancel").onclick = () => {
      cleanup();
      resolve(null);
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") ok();
      if (e.key === "Escape") {
        cleanup();
        resolve(null);
      }
    };
  });
}

/* =========================================================
   記録タブ
   ========================================================= */
const bodyPartSelect = $("#bodyPartSelect");
const exerciseSelect = $("#exerciseSelect");
const setsList = $("#setsList");

function getBodyParts() {
  return Object.keys(state.exercises);
}

function renderBodyParts(selected) {
  const parts = getBodyParts();
  bodyPartSelect.innerHTML = parts
    .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
    .join("");
  if (selected && parts.includes(selected)) bodyPartSelect.value = selected;
  renderExercises();
}

function renderExercises(selected) {
  const part = bodyPartSelect.value;
  const list = state.exercises[part] || [];
  if (list.length === 0) {
    exerciseSelect.innerHTML = `<option value="" disabled selected>種目がありません（＋で追加）</option>`;
  } else {
    exerciseSelect.innerHTML = list
      .map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`)
      .join("");
    if (selected && list.includes(selected)) exerciseSelect.value = selected;
  }
}

bodyPartSelect.addEventListener("change", () => renderExercises());

// 部位を追加
$("#addBodyPart").addEventListener("click", async () => {
  const name = await promptModal("部位を追加", "例：前腕、ふくらはぎ");
  if (!name) return;
  if (state.exercises[name]) {
    renderBodyParts(name);
    return;
  }
  state.exercises[name] = [];
  saveData();
  renderBodyParts(name);
});

// 種目を新規追加
$("#addExercise").addEventListener("click", async () => {
  const part = bodyPartSelect.value;
  if (!part) {
    await promptModal("先に部位を追加してください");
    return;
  }
  const name = await promptModal(`「${part}」の種目を追加`, "種目名");
  if (!name) return;
  if (!state.exercises[part].includes(name)) {
    state.exercises[part].push(name);
    saveData();
  }
  renderExercises(name);
});

/* ---- セット行 ---- */
function addSetRow(weight = "", reps = "") {
  const row = document.createElement("div");
  row.className = "set-row";
  row.innerHTML = `
    <span class="set-no"></span>
    <input type="number" class="set-weight" inputmode="decimal" min="0" step="0.5" value="${weight}" />
    <input type="number" class="set-reps" inputmode="numeric" min="0" step="1" value="${reps}" />
    <button class="del-set" title="削除">×</button>
  `;
  row.querySelector(".del-set").addEventListener("click", () => {
    row.remove();
    renumberSets();
    if (setsList.children.length === 0) addSetRow();
  });
  setsList.appendChild(row);
  renumberSets();
}

function renumberSets() {
  setsList.querySelectorAll(".set-row").forEach((r, i) => {
    r.querySelector(".set-no").textContent = i + 1;
  });
}

$("#addSet").addEventListener("click", () => addSetRow());

// 記録を保存
$("#saveRecord").addEventListener("click", () => {
  const date = $("#recordDate").value || todayStr();
  const bodyPart = bodyPartSelect.value;
  const exercise = exerciseSelect.value;

  if (!bodyPart || !exercise) {
    alert("部位と種目を選択してください。");
    return;
  }

  const sets = [];
  setsList.querySelectorAll(".set-row").forEach((r) => {
    const w = r.querySelector(".set-weight").value;
    const reps = r.querySelector(".set-reps").value;
    if (w !== "" || reps !== "") {
      sets.push({ weight: w === "" ? 0 : Number(w), reps: reps === "" ? 0 : Number(reps) });
    }
  });

  if (sets.length === 0) {
    alert("少なくとも1セット入力してください。");
    return;
  }

  state.records.push({
    id: uid(),
    date,
    bodyPart,
    exercise,
    sets,
    memo: $("#recordMemo").value.trim(),
  });
  saveData();

  // フォームを軽くリセット
  $("#recordMemo").value = "";
  setsList.innerHTML = "";
  addSetRow();
  alert("保存しました 💪");
});

/* =========================================================
   履歴タブ
   ========================================================= */
const historyList = $("#historyList");
const historyFilter = $("#historyFilter");

function renderHistoryFilter() {
  const parts = getBodyParts();
  const current = historyFilter.value || "__all__";
  historyFilter.innerHTML =
    `<option value="__all__">すべて</option>` +
    parts
      .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
      .join("");
  historyFilter.value = current;
}

historyFilter.addEventListener("change", renderHistory);

function renderHistory() {
  renderHistoryFilter();
  const filter = historyFilter.value;
  let records = [...state.records];
  if (filter && filter !== "__all__") {
    records = records.filter((r) => r.bodyPart === filter);
  }
  // 日付の新しい順
  records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (records.length === 0) {
    historyList.innerHTML = `<div class="history-empty">まだ記録がありません。</div>`;
    return;
  }

  historyList.innerHTML = records
    .map((r) => {
      const setsText = r.sets
        .map((s, i) => `${i + 1}set: ${s.weight}kg × ${s.reps}回`)
        .join("<br>");
      return `
      <div class="history-item">
        <div class="hi-top">
          <span class="hi-date">${escapeHtml(r.date)}</span>
          <span class="hi-part">${escapeHtml(r.bodyPart)}</span>
        </div>
        <div class="hi-name">${escapeHtml(r.exercise)}</div>
        <div class="hi-sets">${setsText}</div>
        ${r.memo ? `<div class="hi-memo">📝 ${escapeHtml(r.memo)}</div>` : ""}
        <button class="hi-del" data-id="${r.id}">削除</button>
      </div>`;
    })
    .join("");

  historyList.querySelectorAll(".hi-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("この記録を削除しますか？")) return;
      state.records = state.records.filter((r) => r.id !== btn.dataset.id);
      saveData();
      renderHistory();
    });
  });
}

/* =========================================================
   CSV出力
   ========================================================= */
function csvCell(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

$("#exportCsv").addEventListener("click", () => {
  if (state.records.length === 0) {
    alert("出力する記録がありません。");
    return;
  }
  const header = ["日付", "部位", "種目", "セット番号", "重量(kg)", "回数", "メモ"];
  const rows = [header];

  const sorted = [...state.records].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
  sorted.forEach((r) => {
    r.sets.forEach((s, i) => {
      rows.push([r.date, r.bodyPart, r.exercise, i + 1, s.weight, s.reps, r.memo]);
    });
  });

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  // Excelで文字化けしないよう BOM を付与
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kintore_${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

/* =========================================================
   エスケープ
   ========================================================= */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =========================================================
   初期化
   ========================================================= */
function init() {
  $("#recordDate").value = todayStr();
  renderBodyParts();
  addSetRow();
  renderTimer();
}
init();
