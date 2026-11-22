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

export function createTankaCard(card, isSelected, onCheckChange, onOpenEdit) {
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
  const memoMark = card.memo && card.memo.trim() ? ' [メモ]' : '';
  metaInfo.textContent = `${tagsText}${memoMark}`.trim();

  metaWrap.appendChild(checkWrap);
  metaWrap.appendChild(metaInfo);

  cardEl.appendChild(bodyEl);
  cardEl.appendChild(metaWrap);
  return cardEl;
}

export function updateSelectionBarUI(selectedCount, DOM) {
  if (selectedCount > 0) {
    DOM.footerNormal.style.display = 'none';
    DOM.footerSelection.style.display = 'flex';
    DOM.selectionCount.textContent = `${selectedCount}件選択中`;
  } else {
    DOM.footerNormal.style.display = 'flex';
    DOM.footerSelection.style.display = 'none';
  }
}
