/** さいきよ2 - 書庫モジュール（シンプル削除・本格D&D並べ替え＋時速百キロ根絶エッジスクロール・詳細・TL返却） */

import {
  saveCard,
  bulkSaveCards,
  loadAllShelves,
  getShelf,
  bulkSaveShelves,
  deleteShelf
} from './db.js';
import { formatDateWithWeekday } from './ui.js';

export function initShelfModule({ onTimelineUpdated, onCloseWings }) {
  let currentDetailShelfId = null;

  // ドラッグ＆ドロップ状態（初代さいきよ準拠＋時間ベース穏やかエッジスクロール）
  const drag = {
    item: null,
    placeholder: null,
    isDragging: false,
    timer: null,
    startX: 0,
    startY: 0,
    origLeft: 0,
    offsetY: 0,
    lastY: 0,
    lastMoveTime: 0,
    scrollSpeedPxPerSec: 0,
    lastFrameTime: 0,
    rafId: null
  };

  const DOM = {
    panelShelf: document.getElementById('panel-shelf'),
    btnOpenShelf: document.getElementById('btn-open-shelf'),
    shelfListView: document.getElementById('shelf-list-view'),
    shelfList: document.getElementById('shelf-list'),
    shelfDetailView: document.getElementById('shelf-detail-view'),
    shelfDetailTitle: document.getElementById('shelf-detail-title'),
    shelfDetailMeta: document.getElementById('shelf-detail-meta'),
    shelfDetailMemo: document.getElementById('shelf-detail-memo'),
    shelfDetailItems: document.getElementById('shelf-detail-items'),
    btnShelfBackList: document.getElementById('btn-shelf-back-list'),
    btnShelfCopy: document.getElementById('btn-shelf-copy'),
    btnShelfReturnScatter: document.getElementById('btn-shelf-return-scatter'),
    btnShelfReturnBlock: document.getElementById('btn-shelf-return-block')
  };

  // HTML側に残っている一括削除ボタンがあれば撤去
  const legacyBulkBtn = document.getElementById('btn-shelf-bulk-delete');
  if (legacyBulkBtn) legacyBulkBtn.remove();

  // フッター表示は件数を出さず常に「書庫」のみ
  async function updateBadge() {
    if (DOM.btnOpenShelf) {
      DOM.btnOpenShelf.textContent = '書庫';
    }
  }

  function showListView() {
    DOM.shelfDetailView.style.display = 'none';
    DOM.shelfListView.style.display = 'block';
    currentDetailShelfId = null;
  }

  async function renderList() {
    const shelves = await loadAllShelves();
    DOM.shelfList.innerHTML = '';

    if (shelves.length === 0) {
      DOM.shelfList.innerHTML = '<div class="shelf-empty">書庫は空です。<br>カードを選んで「机へ」または編集画面の「書庫に収める」から保管できます。</div>';
      return;
    }

    shelves.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    shelves.forEach(shelf => {
      const row = document.createElement('div');
      row.className = 'shelf-row';
      row.dataset.id = shelf.id;

      const main = document.createElement('div');
      main.className = 'shelf-row-main';

      const titleEl = document.createElement('div');
      titleEl.className = 'shelf-row-title';
      titleEl.textContent = shelf.title || '無題';

      const metaEl = document.createElement('div');
      metaEl.className = 'shelf-row-meta';
      const count = Array.isArray(shelf.items) ? shelf.items.length : 0;
      const dateStr = formatDateWithWeekday(shelf.id);
      const tagStr = Array.isArray(shelf.tags) && shelf.tags.length > 0 ? '  ' + shelf.tags.join(' ') : '';
      metaEl.textContent = `${count}首 / ${dateStr}${tagStr}`;

      main.appendChild(titleEl);
      main.appendChild(metaEl);
      main.addEventListener('click', () => {
        if (drag.isDragging) return;
        openDetail(shelf.id);
      });

      const controls = document.createElement('div');
      controls.className = 'shelf-row-controls';

      const handle = document.createElement('div');
      handle.className = 'shelf-handle';
      handle.innerHTML = '&#9776;';
      handle.addEventListener('pointerdown', (e) => handlePointerDown(e, row));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'shelf-del-btn';
      delBtn.textContent = '×';
      delBtn.title = '書庫から削除';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`「${shelf.title || '無題'}」を書庫から削除しますか？`)) {
          await deleteShelf(shelf.id);
          await renderList();
          await updateBadge();
        }
      });

      controls.appendChild(handle);
      controls.appendChild(delBtn);

      row.appendChild(main);
      row.appendChild(controls);
      DOM.shelfList.appendChild(row);
    });
  }

  // --- 本格D&D（250ms長押し・抜け殻・穏やか可変速エッジスクロール） ---
  function handlePointerDown(e, row) {
    if (e.button !== 0 && e.type !== 'touchstart') return;

    drag.item = row;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.isDragging = false;

    drag.timer = setTimeout(() => startDrag(e), 250);

    document.addEventListener('pointermove', checkDragThreshold, { passive: true });
    document.addEventListener('pointerup', cancelPreDrag);
    document.addEventListener('pointercancel', cancelPreDrag);
  }

  function checkDragThreshold(e) {
    if (!drag.item || drag.isDragging) return;
    if (Math.abs(e.clientX - drag.startX) > 10 || Math.abs(e.clientY - drag.startY) > 10) {
      cancelPreDrag();
    }
  }

  function cancelPreDrag() {
    clearTimeout(drag.timer);
    drag.timer = null;
    drag.item = null;
    removePreDragListeners();
  }

  function removePreDragListeners() {
    document.removeEventListener('pointermove', checkDragThreshold);
    document.removeEventListener('pointerup', cancelPreDrag);
    document.removeEventListener('pointercancel', cancelPreDrag);
  }

  function startDrag(e) {
    if (!drag.item) return;
    drag.isDragging = true;
    removePreDragListeners();

    const rect = drag.item.getBoundingClientRect();
    drag.origLeft = rect.left;
    drag.offsetY = e.clientY - rect.top;
    drag.lastY = e.clientY;

    drag.placeholder = document.createElement('div');
    drag.placeholder.className = 'shelf-placeholder';
    drag.placeholder.style.height = `${rect.height}px`;
    DOM.shelfList.insertBefore(drag.placeholder, drag.item);

    drag.item.classList.add('dragging');
    drag.item.style.width = `${rect.width}px`;
    drag.item.style.height = `${rect.height}px`;
    drag.item.style.left = `${rect.left}px`;
    drag.item.style.top = `${rect.top}px`;

    document.body.appendChild(drag.item);
    if (navigator.vibrate) navigator.vibrate(35);

    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  function checkIntersection() {
    if (!drag.item || !drag.placeholder) return;

    const checkX = drag.origLeft + (drag.item.offsetWidth / 2);
    const checkY = drag.lastY;
    const elements = document.elementsFromPoint(checkX, checkY);
    const target = elements.find(
      el => el.classList && el.classList.contains('shelf-row') && el.parentNode === DOM.shelfList
    );

    if (target && target !== drag.placeholder && target !== drag.item) {
      const targetRect = target.getBoundingClientRect();
      if (checkY < targetRect.top + targetRect.height / 2) {
        DOM.shelfList.insertBefore(drag.placeholder, target);
      } else {
        DOM.shelfList.insertBefore(drag.placeholder, target.nextSibling);
      }
    } else if (!target) {
      const listRect = DOM.shelfList.getBoundingClientRect();
      if (checkY > listRect.bottom) {
        DOM.shelfList.appendChild(drag.placeholder);
      } else if (checkY < listRect.top && DOM.shelfList.firstChild) {
        DOM.shelfList.insertBefore(drag.placeholder, DOM.shelfList.firstChild);
      }
    }
  }

  function stepAutoScroll(now) {
    if (!drag.isDragging || drag.scrollSpeedPxPerSec === 0) {
      drag.rafId = null;
      drag.lastFrameTime = 0;
      return;
    }

    if (!drag.lastFrameTime) drag.lastFrameTime = now;
    const dt = Math.min(0.05, (now - drag.lastFrameTime) / 1000);
    drag.lastFrameTime = now;

    DOM.panelShelf.scrollTop += drag.scrollSpeedPxPerSec * dt;
    checkIntersection();
    drag.rafId = requestAnimationFrame(stepAutoScroll);
  }

  function handlePointerMove(e) {
    if (!drag.isDragging || !drag.item) return;
    e.preventDefault();

    const now = Date.now();
    if (now - drag.lastMoveTime < 16) return;
    drag.lastMoveTime = now;

    drag.lastY = e.clientY;
    drag.item.style.left = `${drag.origLeft}px`;
    drag.item.style.top = `${e.clientY - drag.offsetY}px`;

    // 枠線付近のエッジスクロール：時間ベース＋二乗カーブ＋上限クランプ（時速百キロ根絶）
    const panelRect = DOM.panelShelf.getBoundingClientRect();
    const dragRect = drag.item.getBoundingClientRect();
    const threshold = 72;
    const minSpeed = 70;   // px/sec（枠に触れた直後はゆっくり）
    const maxSpeed = 300;  // px/sec（最大でも目で追える穏やかな上限）

    if (dragRect.top < panelRect.top + threshold) {
      const over = Math.max(0, (panelRect.top + threshold) - dragRect.top);
      const ratio = Math.min(1, over / threshold);
      drag.scrollSpeedPxPerSec = -(minSpeed + (maxSpeed - minSpeed) * ratio * ratio);
    } else if (dragRect.bottom > panelRect.bottom - threshold) {
      const over = Math.max(0, dragRect.bottom - (panelRect.bottom - threshold));
      const ratio = Math.min(1, over / threshold);
      drag.scrollSpeedPxPerSec = minSpeed + (maxSpeed - minSpeed) * ratio * ratio;
    } else {
      drag.scrollSpeedPxPerSec = 0;
    }

    if (drag.scrollSpeedPxPerSec !== 0 && !drag.rafId) {
      drag.lastFrameTime = 0;
      drag.rafId = requestAnimationFrame(stepAutoScroll);
    }

    checkIntersection();
  }

  async function handlePointerUp() {
    if (!drag.isDragging || !drag.item) return;

    drag.scrollSpeedPxPerSec = 0;
    if (drag.rafId) {
      cancelAnimationFrame(drag.rafId);
      drag.rafId = null;
    }
    drag.lastFrameTime = 0;

    DOM.shelfList.insertBefore(drag.item, drag.placeholder);
    drag.placeholder.remove();
    drag.placeholder = null;

    drag.item.classList.remove('dragging');
    drag.item.style.cssText = '';

    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    drag.item = null;
    drag.isDragging = false;

    const ids = Array.from(DOM.shelfList.querySelectorAll('.shelf-row')).map(el => Number(el.dataset.id));
    const shelves = (await Promise.all(ids.map(id => getShelf(id)))).filter(Boolean);
    shelves.forEach((shelf, idx) => {
      shelf.order = idx + 1;
    });
    await bulkSaveShelves(shelves);
  }

  // --- 書庫詳細ビュー＆タイムライン返却 ---
  async function openDetail(shelfId) {
    const shelf = await getShelf(shelfId);
    if (!shelf) return;

    currentDetailShelfId = shelf.id;
    DOM.shelfDetailTitle.textContent = shelf.title || '無題';

    const count = Array.isArray(shelf.items) ? shelf.items.length : 0;
    const dateStr = formatDateWithWeekday(shelf.id);
    const tagStr = Array.isArray(shelf.tags) && shelf.tags.length > 0 ? '  ' + shelf.tags.join(' ') : '';
    DOM.shelfDetailMeta.textContent = `${count}首 / 作成: ${dateStr}${tagStr}`;

    if (shelf.memo && shelf.memo.trim()) {
      DOM.shelfDetailMemo.style.display = 'block';
      DOM.shelfDetailMemo.textContent = shelf.memo;
    } else {
      DOM.shelfDetailMemo.style.display = 'none';
    }

    DOM.shelfDetailItems.innerHTML = '';
    (shelf.items || []).forEach((item, idx) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'shelf-detail-card';

      const bodyEl = document.createElement('div');
      bodyEl.className = 'shelf-detail-card-body';
      bodyEl.textContent = item.content;

      const subEl = document.createElement('div');
      subEl.className = 'shelf-detail-card-sub';
      const itemDate = formatDateWithWeekday(item.id);
      const itemTags = Array.isArray(item.tags) && item.tags.length > 0 ? '  ' + item.tags.join(' ') : '';
      subEl.textContent = `${idx + 1}. 原本: ${itemDate}${itemTags}`;

      cardEl.appendChild(bodyEl);
      cardEl.appendChild(subEl);
      DOM.shelfDetailItems.appendChild(cardEl);
    });

    DOM.shelfListView.style.display = 'none';
    DOM.shelfDetailView.style.display = 'block';
  }

  DOM.btnShelfBackList.addEventListener('click', showListView);

  DOM.btnShelfCopy.addEventListener('click', async () => {
    if (!currentDetailShelfId) return;
    const shelf = await getShelf(currentDetailShelfId);
    if (!shelf || !Array.isArray(shelf.items)) return;

    const text = shelf.items.map(i => i.content).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('コピーしました。');
    } catch (_) {
      alert('コピーに失敗しました。');
    }
  });

  DOM.btnShelfReturnScatter.addEventListener('click', async () => {
    if (!currentDetailShelfId) return;
    const shelf = await getShelf(currentDetailShelfId);
    if (!shelf || !Array.isArray(shelf.items) || shelf.items.length === 0) return;

    const baseNow = Date.now();
    const newCards = shelf.items.map((item, idx) => ({
      id: baseNow + idx,
      content: item.content,
      memo: item.memo || '',
      tags: Array.isArray(item.tags) ? [...item.tags] : [],
      lastupdated: baseNow + idx,
      deletedAt: null
    }));

    await bulkSaveCards(newCards);
    await onTimelineUpdated();
    onCloseWings();
    alert(`${newCards.length}首をバラでタイムラインへ戻しました。`);
  });

  DOM.btnShelfReturnBlock.addEventListener('click', async () => {
    if (!currentDetailShelfId) return;
    const shelf = await getShelf(currentDetailShelfId);
    if (!shelf || !Array.isArray(shelf.items) || shelf.items.length === 0) return;

    const now = Date.now();
    const blockCard = {
      id: now,
      content: shelf.items.map(i => i.content).join('\n\n'),
      memo: shelf.memo || '',
      tags: Array.isArray(shelf.tags) ? [...shelf.tags] : [],
      lastupdated: now,
      deletedAt: null
    };

    await saveCard(blockCard);
    await onTimelineUpdated();
    onCloseWings();
    alert(`「${shelf.title || '無題'}」をまとめてタイムラインへ戻しました。`);
  });

  return {
    updateBadge,
    async open() {
      showListView();
      await renderList();
    }
  };
}
