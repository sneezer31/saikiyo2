// ui.js
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

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

export function createTankaCard(card, isSelected, onCheckChange, onOpenEdit, showMemoFull = false) {
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.dataset.id = card.id;

  // 上段：本文（350ms以内のダブルタップで編集パネルを開く）
  const bodyEl = document.createElement('div');
  bodyEl.className = 'card-body';
  bodyEl.textContent = card.content;

  let lastTapTime = 0;
  bodyEl.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTapTime <= 350) {
      lastTapTime = 0;
      onOpenEdit(card);
    } else {
      lastTapTime = now;
    }
  });

  cardEl.appendChild(bodyEl);

  // オプション：メモ本文のインライン表示
  const hasMemo = Boolean(card.memo && card.memo.trim());
  if (showMemoFull && hasMemo) {
    const memoEl = document.createElement('div');
    memoEl.className = 'card-memo-preview';
    memoEl.textContent = card.memo;
    cardEl.appendChild(memoEl);
  }

  // 下段：チェックボックス ＋ メタデータ（タグ・メモ有無）
  const metaWrap = document.createElement('div');
  metaWrap.className = 'card-meta-wrap';

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

  const metaInfo = document.createElement('div');
  metaInfo.className = 'card-meta-info';
  const tagsText = Array.isArray(card.tags) && card.tags.length > 0 ? card.tags.join(' ') : '';
  const memoMark = !showMemoFull && hasMemo ? ' [メモ]' : '';
  metaInfo.textContent = `${tagsText}${memoMark}`.trim();

  metaWrap.appendChild(checkWrap);
  metaWrap.appendChild(metaInfo);

  cardEl.appendChild(metaWrap);
  return cardEl;
}

export function updateSelectionBarUI(selectedCount, DOM) {
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');

  if (selectedCount > 0) {
    DOM.selectionDock.classList.add('open');
    DOM.selectionDock.setAttribute('aria-hidden', 'false');
    DOM.selectionCount.textContent = `${selectedCount}件選択`;
    DOM.footerBar.style.display = 'none';
  } else {
    DOM.selectionDock.classList.remove('open');
    DOM.selectionDock.setAttribute('aria-hidden', 'true');
    if (!isConsoleOpen) {
      DOM.footerBar.style.display = 'block';
    }
  }
}
