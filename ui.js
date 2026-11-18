export function createTankaCard(card, isSelected, onCheck, onClick) {
  const div = document.createElement('div');
  div.className = 'card';
  
  // 上段：メタデータ行（チェックボックスと日付・タグを同じ箱に入れる）
  const metaWrap = document.createElement('div');
  metaWrap.className = 'card-meta-wrap';
  
  const checkWrap = document.createElement('div');
  checkWrap.className = 'card-check-wrap';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.className = 'card-check'; 
  chk.checked = isSelected;
  chk.addEventListener('change', (e) => onCheck(card.id, e.target.checked));
  checkWrap.appendChild(chk);

  const metaInfo = document.createElement('div');
  metaInfo.className = 'card-meta-info';
  const dateStr = new Date(card.id).toLocaleString();
  const tagStr = card.tags && Array.isArray(card.tags) ? card.tags.join(' ') : '';
  metaInfo.innerHTML = `${dateStr}  ${tagStr}`;

  metaWrap.appendChild(checkWrap);
  metaWrap.appendChild(metaInfo);

  // 下段：本文
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = card.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  body.addEventListener('click', () => onClick(card));

  div.appendChild(metaWrap);
  div.appendChild(body);
  
  return div;
}

export function updateSelectionBarUI(count, DOM) {
  if (count > 0) {
    DOM.footerNormal.style.display = 'none';
    DOM.footerSelection.style.display = 'flex';
    DOM.selectionCount.innerText = `${count}件選択中`;
  } else {
    DOM.footerNormal.style.display = 'flex';
    DOM.footerSelection.style.display = 'none';
  }
}
