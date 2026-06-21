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
  // 種目名 -> 記録タイプ（"weight" 重量×回数 / "time" 時間秒）
  exerciseTypes: {},
  // 設定（入力する重量の単位）
  settings: { unit: "lb" },
};

// 重量の換算（1 lb = 0.45359237 kg）
const LB_TO_KG = 0.45359237;
const lbToKg = (lb) => lb * LB_TO_KG;
const kgToLb = (kg) => kg / LB_TO_KG;

// 入力値をkgに変換（単位に応じて）
function toKg(weight, unit) {
  return unit === "kg" ? Number(weight) : lbToKg(Number(weight));
}

// 種目の記録タイプ（"weight" or "time"）。未設定は重量×回数
function getExerciseType(name) {
  return state.exerciseTypes[name] === "time" ? "time" : "weight";
}

// 秒数を「1分30秒」形式に（60秒未満は空文字）
function formatSeconds(sec) {
  const s = Number(sec);
  if (s < 60) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}分${r}秒` : `${m}分`;
}

/* ---------- データ層 ---------- */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    const data = JSON.parse(raw);
    if (!data.exercises) data.exercises = {};
    if (!Array.isArray(data.records)) data.records = [];
    if (!data.exerciseTypes) data.exerciseTypes = {};
    if (!data.settings) data.settings = { unit: "lb" };
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
// opts.withType を渡すと「重量×回数 / 時間」の選択UIを表示し、
// 解決値を { name, type } で返す。それ以外は名前の文字列（or null）を返す。
function promptModal(title, placeholder = "", opts = {}) {
  return new Promise((resolve) => {
    const modal = $("#modal");
    const input = $("#modalInput");
    const typeRow = $("#modalType");
    $("#modalTitle").textContent = title;
    input.value = "";
    input.placeholder = placeholder;

    let chosenType = "weight";
    if (opts.withType) {
      typeRow.hidden = false;
      $$(".mtype-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.mtype === "weight");
        b.onclick = () => {
          chosenType = b.dataset.mtype;
          $$(".mtype-btn").forEach((x) => x.classList.toggle("active", x === b));
        };
      });
    } else {
      typeRow.hidden = true;
    }

    modal.hidden = false;
    setTimeout(() => input.focus(), 50);

    const cleanup = () => {
      modal.hidden = true;
      $("#modalOk").onclick = null;
      $("#modalCancel").onclick = null;
      input.onkeydown = null;
      $$(".mtype-btn").forEach((b) => (b.onclick = null));
    };
    const finish = (value) => {
      cleanup();
      resolve(value);
    };
    const ok = () => {
      const val = input.value.trim();
      if (opts.withType) finish(val ? { name: val, type: chosenType } : null);
      else finish(val || null);
    };
    $("#modalOk").onclick = ok;
    $("#modalCancel").onclick = () => finish(null);
    input.onkeydown = (e) => {
      if (e.key === "Enter") ok();
      if (e.key === "Escape") finish(null);
    };
  });
}

/* =========================================================
   記録タブ
   ========================================================= */
const bodyPartSelect = $("#bodyPartSelect");
const exerciseSelect = $("#exerciseSelect");
const setsList = $("#setsList");

// ドロップダウン内の「新規追加」用の特別な値
const ADD_NEW = "__add_new__";
let currentExercise = ""; // 直近に選んでいた有効な種目（追加をキャンセルしたとき戻す用）

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
  const addOption = `<option value="${ADD_NEW}">＋ 新しい種目を追加…</option>`;
  if (list.length === 0) {
    exerciseSelect.innerHTML =
      `<option value="" disabled selected>種目を選択 / 追加</option>` + addOption;
  } else {
    exerciseSelect.innerHTML =
      list
        .map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`)
        .join("") + addOption;
    if (selected && list.includes(selected)) exerciseSelect.value = selected;
  }
  if (exerciseSelect.value !== ADD_NEW) currentExercise = exerciseSelect.value;
  updateLastRecord();
}

bodyPartSelect.addEventListener("change", () => renderExercises());
exerciseSelect.addEventListener("change", () => {
  if (exerciseSelect.value === ADD_NEW) {
    addNewExercise(currentExercise); // ドロップダウンから「新規追加」を選んだ
    return;
  }
  currentExercise = exerciseSelect.value;
  updateLastRecord();
});

/* ---- 前回の記録 ---- */
// 指定した部位・種目で最も新しい記録を返す
function findLastRecord(bodyPart, exercise) {
  let best = null;
  let bestIdx = -1;
  state.records.forEach((r, idx) => {
    if (r.bodyPart !== bodyPart || r.exercise !== exercise) return;
    // 日付が新しい、または同日なら後から登録したものを優先
    if (best === null || r.date > best.date || (r.date === best.date && idx > bestIdx)) {
      best = r;
      bestIdx = idx;
    }
  });
  return best;
}

function updateLastRecord() {
  applyExerciseType(); // 種目に応じて入力UIを切り替える
  const box = $("#lastRecord");
  const part = bodyPartSelect.value;
  const exercise = exerciseSelect.value;
  if (!part || !exercise) {
    box.hidden = true;
    return;
  }
  const rec = findLastRecord(part, exercise);
  box.hidden = false;
  if (!rec) {
    box.innerHTML = `<div class="lr-none">前回の記録はありません（初めての種目）</div>`;
    return;
  }
  const recType = rec.type || "weight";
  let setsText;
  if (recType === "time") {
    setsText = rec.sets
      .map((s) => {
        const f = formatSeconds(s.seconds);
        return `${s.seconds} 秒${f ? `（${f}）` : ""}`;
      })
      .join("<br>");
  } else {
    const unit = rec.unit || "kg"; // 旧データはkg扱い
    setsText = rec.sets
      .map((s) => {
        const conv =
          unit === "lb"
            ? ` <span style="color:var(--muted)">(≈${lbToKg(Number(s.weight)).toFixed(1)}kg)</span>`
            : "";
        const drop = s.drop ? ` <span class="drop-badge">🔻ドロップ</span>` : "";
        return `${s.weight} ${unit} × ${s.reps}回${conv}${drop}`;
      })
      .join("<br>");
  }
  const [, m, d] = rec.date.split("-");

  // 前回の記録が「その日の何種目目」だったか、当日の実施順を求める
  // （記録は実施順に保存されている前提）
  const dayRecords = state.records
    .map((r, idx) => ({ r, idx }))
    .filter((x) => x.r.date === rec.date)
    .sort((a, b) => a.idx - b.idx);
  const pos = dayRecords.findIndex((x) => x.r === rec);
  const orderNo = pos + 1;
  const total = dayRecords.length;

  let flowHtml = "";
  if (total > 1) {
    const flow = dayRecords
      .map((x, i) =>
        i === pos
          ? `<span class="lr-current">${escapeHtml(x.r.exercise)}</span>`
          : escapeHtml(x.r.exercise)
      )
      .join(" → ");
    flowHtml = `
      <div class="lr-order">前回はこの日の <b>${orderNo}種目目</b>（全${total}種目）</div>
      <div class="lr-flow">${flow}</div>`;
  }

  box.innerHTML = `
    <div class="lr-title">前回（${Number(m)}/${Number(d)}）</div>
    <div class="lr-sets">${setsText}</div>
    ${flowHtml}
    <button type="button" class="lr-reuse" id="reuseLast">前回の内容を入力欄にコピー</button>
  `;
  $("#reuseLast").addEventListener("click", () => reuseLastRecord(rec));
}

// 前回の内容をセット入力欄へコピー
function reuseLastRecord(rec) {
  // セット欄を前回の内容で作り直す（種目タイプに応じて）
  setsList.innerHTML = "";
  if (currentType === "time") {
    rec.sets.forEach((s) => addSetRow(s.seconds));
  } else {
    const unit = rec.unit || "kg";
    state.settings.unit = unit; // 単位を前回に合わせる
    $$(".unit-btn").forEach((b) => b.classList.toggle("active", b.dataset.unit === unit));
    $("#unitLabel").textContent = unit;
    saveData();
    rec.sets.forEach((s) => addSetRow(s.weight, s.reps, !!s.drop));
  }
  if (setsList.children.length === 0) addSetRow();
}

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

// 種目を新規追加（ボタン・ドロップダウンの両方から呼ばれる）
async function addNewExercise(prev) {
  const part = bodyPartSelect.value;
  if (!part) {
    await promptModal("先に部位を選んでください");
    renderExercises(prev);
    return;
  }
  const result = await promptModal(
    `「${part}」に新しい種目を追加`,
    "種目名（例：プランク、ベンチプレス）",
    { withType: true }
  );
  const name = result && result.name;
  if (name && !state.exercises[part].includes(name)) {
    state.exercises[part].push(name);
    state.exerciseTypes[name] = result.type; // 記録タイプを保存
    saveData();
  }
  // 追加した種目を選択。キャンセル時は元の選択に戻す
  renderExercises(name || prev);
}

$("#addExercise").addEventListener("click", () => addNewExercise(currentExercise));

// 記録中の種目タイプ（"weight" / "time"）
let currentType = "weight";

// 選択中の種目に応じてセット入力UI（重量×回数 / 時間）を切り替える
function applyExerciseType() {
  const ex = exerciseSelect.value;
  const type = ex && ex !== ADD_NEW ? getExerciseType(ex) : "weight";
  if (type === currentType) return;
  currentType = type;
  setSetsModeUI();
  setsList.innerHTML = "";
  addSetRow();
}

function setSetsModeUI() {
  const area = $("#setsArea");
  const header = $("#setsHeader");
  if (currentType === "time") {
    area.classList.add("time-mode");
    header.innerHTML = `<span>#</span><span>時間（秒）</span><span></span>`;
  } else {
    area.classList.remove("time-mode");
    header.innerHTML =
      `<span>#</span><span>重量（<span id="unitLabel">${state.settings.unit}</span>）</span><span>回数</span><span>🔻</span><span></span>`;
  }
}

/* ---- 換算表示の更新 ---- */
function updateConvHint(row) {
  const input = row.querySelector(".set-weight");
  if (!input) return; // 時間モードの行
  const v = input.value;
  const hint = row.querySelector(".conv-hint");
  if (v === "" || isNaN(Number(v))) {
    hint.textContent = "";
    return;
  }
  const unit = state.settings.unit;
  if (unit === "lb") {
    hint.textContent = `≈ ${lbToKg(Number(v)).toFixed(1)} kg`;
  } else {
    hint.textContent = `≈ ${kgToLb(Number(v)).toFixed(1)} lb`;
  }
}

// 時間モードの秒数 → 「1分30秒」表示
function updateSecHint(row) {
  const v = row.querySelector(".set-seconds").value;
  const hint = row.querySelector(".conv-hint");
  hint.textContent = v === "" || isNaN(Number(v)) ? "" : (formatSeconds(v) ? `= ${formatSeconds(v)}` : "");
}

function refreshAllConvHints() {
  $("#unitLabel").textContent = state.settings.unit;
  setsList.querySelectorAll(".set-row").forEach(updateConvHint);
}

/* ---- セット行 ---- */
// 重量モード: addSetRow(weight, reps, drop) / 時間モード: addSetRow(seconds)
function addSetRow(a = "", b = "", drop = false) {
  const row = document.createElement("div");
  row.className = "set-row";
  if (currentType === "time") {
    row.innerHTML = `
      <span class="set-no"></span>
      <div class="weight-cell">
        <input type="number" class="set-seconds" inputmode="numeric" min="0" step="1" value="${a}" />
        <span class="conv-hint"></span>
      </div>
      <button class="del-set" title="削除">×</button>
    `;
    row.querySelector(".set-seconds").addEventListener("input", () => updateSecHint(row));
  } else {
    row.innerHTML = `
      <span class="set-no"></span>
      <div class="weight-cell">
        <input type="number" class="set-weight" inputmode="decimal" min="0" step="0.5" value="${a}" />
        <span class="conv-hint"></span>
      </div>
      <input type="number" class="set-reps" inputmode="numeric" min="0" step="1" value="${b}" />
      <button type="button" class="drop-btn${drop ? " active" : ""}" title="ドロップセット">🔻</button>
      <button class="del-set" title="削除">×</button>
    `;
    row.querySelector(".set-weight").addEventListener("input", () => updateConvHint(row));
    row
      .querySelector(".drop-btn")
      .addEventListener("click", (e) => e.currentTarget.classList.toggle("active"));
  }
  row.querySelector(".del-set").addEventListener("click", () => {
    row.remove();
    renumberSets();
    if (setsList.children.length === 0) addSetRow();
  });
  setsList.appendChild(row);
  renumberSets();
  if (currentType === "time") updateSecHint(row);
  else updateConvHint(row);
}

/* ---- 単位切替（lb / kg） ---- */
$$(".unit-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.settings.unit = btn.dataset.unit;
    $$(".unit-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.unit === state.settings.unit)
    );
    saveData();
    refreshAllConvHints();
  });
});

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
  if (currentType === "time") {
    setsList.querySelectorAll(".set-row").forEach((r) => {
      const sec = r.querySelector(".set-seconds").value;
      if (sec !== "") sets.push({ seconds: Number(sec) });
    });
    if (sets.length === 0) {
      alert("時間（秒）を入力してください。");
      return;
    }
  } else {
    setsList.querySelectorAll(".set-row").forEach((r) => {
      const w = r.querySelector(".set-weight").value;
      const reps = r.querySelector(".set-reps").value;
      if (w !== "" || reps !== "") {
        const set = { weight: w === "" ? 0 : Number(w), reps: reps === "" ? 0 : Number(reps) };
        if (r.querySelector(".drop-btn").classList.contains("active")) set.drop = true;
        sets.push(set);
      }
    });
    if (sets.length === 0) {
      alert("少なくとも1セット入力してください。");
      return;
    }
  }

  state.records.push({
    id: uid(),
    date,
    bodyPart,
    exercise,
    type: currentType,
    unit: currentType === "time" ? null : state.settings.unit,
    sets,
    memo: $("#recordMemo").value.trim(),
  });
  saveData();

  // フォームを軽くリセット
  $("#recordMemo").value = "";
  setsList.innerHTML = "";
  addSetRow();
  updateLastRecord(); // 今保存した内容が「前回」として反映される
  alert("保存しました 💪");
});

/* =========================================================
   履歴タブ
   ========================================================= */
const historyList = $("#historyList");
const historyFilter = $("#historyFilter");

/* ---- カレンダー ---- */
const calGrid = $("#calGrid");
const calMonthLabel = $("#calMonth");
const _now = new Date();
let calYear = _now.getFullYear();
let calMonth = _now.getMonth(); // 0-11
let selectedDate = null; // "YYYY-MM-DD"。日付で絞り込み中の日

function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// 記録がある日付の集合
function recordedDates() {
  return new Set(state.records.map((r) => r.date));
}

function renderCalendar() {
  calMonthLabel.textContent = `${calYear}年 ${calMonth + 1}月`;
  const firstWeekday = new Date(calYear, calMonth, 1).getDay(); // 0=日
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const recorded = recordedDates();
  const todayVal = todayStr();

  let html = "";
  for (let i = 0; i < firstWeekday; i++) {
    html += `<button class="cal-day empty" disabled></button>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = ymd(calYear, calMonth, d);
    const cls = ["cal-day"];
    if (recorded.has(ds)) cls.push("has-record");
    if (ds === todayVal) cls.push("today");
    if (ds === selectedDate) cls.push("selected");
    html += `<button class="${cls.join(" ")}" data-date="${ds}">${d}</button>`;
  }
  calGrid.innerHTML = html;

  calGrid.querySelectorAll(".cal-day[data-date]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ds = btn.dataset.date;
      selectedDate = selectedDate === ds ? null : ds; // 同じ日を再タップで解除
      renderHistory();
    });
  });
}

$("#calPrev").addEventListener("click", () => {
  if (--calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
$("#calNext").addEventListener("click", () => {
  if (++calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

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

function bindCalClear() {
  const btn = $("#calClear");
  if (btn) {
    btn.addEventListener("click", () => {
      selectedDate = null;
      renderHistory();
    });
  }
}

function renderHistory() {
  renderHistoryFilter();
  renderCalendar();
  const filter = historyFilter.value;
  let records = [...state.records];
  if (filter && filter !== "__all__") {
    records = records.filter((r) => r.bodyPart === filter);
  }
  if (selectedDate) {
    records = records.filter((r) => r.date === selectedDate);
  }
  // 日付の新しい順
  records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // 日付で絞り込み中の見出し（タップで解除）
  let headerHtml = "";
  if (selectedDate) {
    const [, mm, dd] = selectedDate.split("-");
    headerHtml = `<button class="cal-clear" id="calClear">📅 ${Number(mm)}/${Number(dd)} の記録を表示中 — タップで全期間に戻す</button>`;
  }

  if (records.length === 0) {
    const msg = selectedDate ? "この日の記録はありません。" : "まだ記録がありません。";
    historyList.innerHTML = headerHtml + `<div class="history-empty">${msg}</div>`;
    bindCalClear();
    return;
  }

  historyList.innerHTML = headerHtml + records
    .map((r) => {
      let setsText;
      if ((r.type || "weight") === "time") {
        setsText = r.sets
          .map((s, i) => {
            const f = formatSeconds(s.seconds);
            return `${i + 1}set: ${s.seconds}秒${f ? `（${f}）` : ""}`;
          })
          .join("<br>");
      } else {
        const unit = r.unit || "kg"; // 旧データはkg扱い
        setsText = r.sets
          .map((s, i) => {
            const kg = toKg(s.weight, unit).toFixed(1);
            const main = `${s.weight} ${unit}`;
            const conv = unit === "lb" ? `（≈ ${kg} kg）` : "";
            const drop = s.drop ? ` <span class="drop-badge">🔻ドロップ</span>` : "";
            return `${i + 1}set: ${main}${conv} × ${s.reps}回${drop}`;
          })
          .join("<br>");
      }
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

  bindCalClear();
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
  const header = ["日付", "部位", "種目", "セット番号", "重量", "単位", "重量(kg換算)", "回数", "時間(秒)", "ドロップ", "メモ"];
  const rows = [header];

  const sorted = [...state.records].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
  sorted.forEach((r) => {
    if ((r.type || "weight") === "time") {
      r.sets.forEach((s, i) => {
        rows.push([r.date, r.bodyPart, r.exercise, i + 1, "", "", "", "", s.seconds, "", r.memo]);
      });
    } else {
      const unit = r.unit || "kg"; // 旧データはkg扱い
      r.sets.forEach((s, i) => {
        const kg = toKg(s.weight, unit).toFixed(1);
        const drop = s.drop ? "✓" : "";
        rows.push([r.date, r.bodyPart, r.exercise, i + 1, s.weight, unit, kg, s.reps, "", drop, r.memo]);
      });
    }
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
  // 保存済みの単位を反映
  $$(".unit-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.unit === state.settings.unit)
  );
  $("#unitLabel").textContent = state.settings.unit;
  renderBodyParts();
  addSetRow();
  renderTimer();
}
init();
