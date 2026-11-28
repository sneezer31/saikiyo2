// ui.js - カード描画（標準シングルタップ＋押下反応70ms＋標準スクロールガード）
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// --- 操作感定数（スマホOS標準準拠） ---
const OPEN_DELAY_MS = 70;       // タップ後に一瞬反応を見せてから開く間（Android標準64ms準拠）
const SCROLL_GUARD_MS = 200;    // スクロール停止直後の誤爆を防ぐ標準マージン
const MOVE_TOLERANCE_PX = 8;    // タップとスクロールを分ける移動幅（Android標準8dp準拠）

let lastScrollAt = 0;
let pendingOpenTimer = null;
let pendingBodyEl = null;

function cancelPendingOpen() {
  if (pendingOpenTimer) {
    clearTimeout(pendingOpenTimer);
    pendingOpenTimer = null;
  }
  if (pendingBodyEl) {
    pendingBodyEl.style.opacity = '';
    pendingBodyEl = null;
  }
}

document.addEventListener('scroll', () => {
  lastScrollAt = Date.now();
  cancelPendingOpen();
}, { passive: true, capture: true });

export function formatDateWithWeekday(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const w = WEEKDAYS[d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day}（${w}）${hh}:${mm}`;
}

export function createTankaCard(card, { isSelected, displayPrefs, onCheckChange, onOpenEdit }) {
  const prefs = displayPrefs || {
    showDate: false,
    showCheck: true,
    showTags: true,
    showMemo: false,
    oneLine: false
  };

  const cardEl = document.createElement('div');
  cardEl.className = 'card' + (prefs.oneLine ? ' is-compact' : '');
  cardEl.dataset.id = card.id;

  // 日時（設定でONのときのみ）
  if (prefs.showDate) {
    const dateEl = document.createElement('div');
    dateEl.className = 'card-date';
    dateEl.textContent = formatDateWithWeekday(card.id);
    cardEl.appendChild(dateEl);
  }

  // 本文（シングルタップ＋70msの押下反応で編集を開く）
  const bodyEl = document.createElement('div');
  bodyEl.className = 'card-body' + (prefs.oneLine ? ' is-oneline' : '');
  bodyEl.textContent = card.content;

  let startX = 0;
  let startY = 0;
  let moved = false;

  bodyEl.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    moved = false;
  }, { passive: true });

  bodyEl.addEventListener('pointermove', (e) => {
    if (moved) return;
    if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - startY) > MOVE_TOLERANCE_PX) {
      moved = true;
    }
  }, { passive: true });

  bodyEl.addEventListener('click', () => {
    if (moved) return;
    if (Date.now() - lastScrollAt < SCROLL_GUARD_MS) return;

    cancelPendingOpen();
    pendingBodyEl = bodyEl;
    bodyEl.style.opacity = '0.5';

    pendingOpenTimer = setTimeout(() => {
      cancelPendingOpen();
      onOpenEdit(card);
    }, OPEN_DELAY_MS);
  });

  cardEl.appendChild(bodyEl);

  // メモ本文インライン表示
  const hasMemo = Boolean(card.memo && card.memo.trim());
  if (prefs.showMemo && hasMemo) {
    const memoEl = document.createElement('div');
    memoEl.className = 'card-memo-preview';
    memoEl.textContent = card.memo;
    cardEl.appendChild(memoEl);
  }

  // 下段：チェックボックス ＋ タグ・メモ印
  const tagsText = prefs.showTags && Array.isArray(card.tags) && card.tags.length > 0
    ? card.tags.join(' ')
    : '';
  const memoMark = !prefs.showMemo && hasMemo ? '[メモ]' : '';
  const metaText = [tagsText, memoMark].filter(Boolean).join(' ');

  if (prefs.showCheck || metaText) {
    const metaWrap = document.createElement('div');
    metaWrap.className = 'card-meta-wrap';

    if (prefs.showCheck) {
      const checkWrap = document.createElement('div');
      checkWrap.className = 'card-check-wrap';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'card-check';
      chk.checked = isSelected;
      chk.addEventListener('change', (e) => {
        onCheckChange(card.id, e.target.checked);
      });
      checkWrap.appendChild(chk);
      metaWrap.appendChild(checkWrap);
    }

    if (metaText) {
      const metaInfo = document.createElement('div');
      metaInfo.className = 'card-meta-info';
      metaInfo.textContent = metaText;
      metaWrap.appendChild(metaInfo);
    }

    cardEl.appendChild(metaWrap);
  }

  return cardEl;
}

export function updateSelectionBarUI(selectedCount, DOM) {
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');

  if (selectedCount > 0) {
    DOM.selectionDock.classList.add('open');
    DOM.selectionDock.setAttribute('aria-hidden', 'false');
    DOM.selectionCount.textContent = `${selectedCount}枚`;
    DOM.btnFab.style.display = 'none';
  } else {
    DOM.selectionDock.classList.remove('open');
    DOM.selectionDock.setAttribute('aria-hidden', 'true');
    DOM.btnFab.style.display = isConsoleOpen ? 'none' : 'flex';
  }
}
