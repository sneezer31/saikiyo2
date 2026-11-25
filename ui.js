// ui.js - カード描画（標準シングルタップ1本化・スクロール誤爆防止・表示項目トグル）
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// スクロール中・慣性停止直後のタップ誤爆を弾くための最終スクロール時刻
let lastScrollAt = 0;
document.addEventListener('scroll', () => {
  lastScrollAt = Date.now();
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

  // 本文（通常のシングルタップで編集を開く・スクロールや指ブレは開かない）
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
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) {
      moved = true;
    }
  }, { passive: true });

  bodyEl.addEventListener('click', () => {
    if (moved) return;
    if (Date.now() - lastScrollAt < 150) return;
    onOpenEdit(card);
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
    DOM.selectionCount.textContent = String(selectedCount);
    DOM.btnFab.style.display = 'none';
  } else {
    DOM.selectionDock.classList.remove('open');
    DOM.selectionDock.setAttribute('aria-hidden', 'true');
    DOM.btnFab.style.display = isConsoleOpen ? 'none' : 'flex';
  }
}
