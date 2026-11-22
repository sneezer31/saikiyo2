/** さいきよ2 - リスト棚モジュール（一覧・D&D並べ替え・詳細・TL返却） */

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
  const selectedShelfIds = new Set();
  let currentDetailShelfId = null;
  let draggingShelfRow = null;

  const DOM = {
    btnOpenShelf: document.getElementById('btn-open-shelf'),
    shelfListView: document.getElementById('shelf-list-view'),
    shelfList: document.getElementById('shelf-list'),
    btnShelfBulkDelete: document.getElementById('btn-shelf-bulk-delete'),
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

  async function updateBadge() {
    const shelves = await loadAllShelves();
    DOM.btnOpenShelf.textContent = shelves.length > 0 ? `棚(${shelves.length})` : '棚';
  }

  function updateBulkDeleteBtn() {
    const count = selectedShelfIds.size;
    if (count > 0) {
      DOM.btnShelfBulkDelete.style.display = 'inline-block';
      DOM.btnShelfBulkDelete.textContent = `削除(${count})`;
    } else {
      DOM.btnShelfBulkDelete.style.display = 'none';
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
      DOM.shelfList.innerHTML = '<div class="shelf-empty">リスト棚は空です。<br>カードを選んで「机へ」または編集画面の「棚に収める」から保管できます。</div>';
      selectedShelfIds.clear();
      updateBulkDeleteBtn();
      return;
    }

    shelves.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    shelves.forEach(shelf => {
      const row = document.createElement('div');
      row.className = 'shelf-row';
      row.dataset.id = shelf.id;

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'card-check';
      chk.checked = selectedShelfIds.has(shelf.id);
      chk.addEventListener('change', (e) => {
        if (e.target.checked) selectedShelfIds.add(shelf.id);
        else selectedShelfIds.delete(shelf.id);
        updateBulkDeleteBtn();
      });

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
      main.addEventListener('click', () => openDetail(shelf.id));

      const controls = document.createElement('div');
      controls.className = 'shelf-row-controls';

      const handle = document.createElement('div');
      handle.className = 'shelf-handle';
      handle.innerHTML = '&#9776;';
      handle.addEventListener('pointerdown', (e) => startDrag(e, row));

      const delBtn = document.createElement('button');
      delBtn.className = 'shelf-del-btn';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        if (confirm(`「${shelf.title || '無題'}」を棚から削除しますか？`)) {
          await deleteShelf(shelf.id);
          selectedShelfIds.delete(shelf.id);
          updateBulkDeleteBtn();
          await renderList();
          await updateBadge();
        }
      });

      controls.appendChild(handle);
      controls.appendChild(delBtn);

      row.appendChild(chk);
      row.appendChild(main);
      row.appendChild(controls);
      DOM.shelfList.appendChild(row);
    });

    updateBulkDeleteBtn();
  }

  function startDrag(e, row) {
    e.preventDefault();
    draggingShelfRow = row;
    row.classList.add('dragging');

    document.addEventListener('pointermove', onDragMove, { passive: false });
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  }

  function onDragMove(e) {
    if (!draggingShelfRow) return;
    e.preventDefault();

    const rows = Array.from(DOM.shelfList.querySelectorAll('.shelf-row:not(.dragging)'));
    const y = e.clientY;
    let inserted = false;

    for (const target of rows) {
      const rect = target.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        DOM.shelfList.insertBefore(draggingShelfRow, target);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      DOM.shelfList.appendChild(draggingShelfRow);
    }
  }

  async function onDragEnd() {
    if (!draggingShelfRow) return;
    draggingShelfRow.classList.remove('dragging');
    draggingShelfRow = null;

    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);

    const ids = Array.from(DOM.shelfList.querySelectorAll('.shelf-row')).map(el => Number(el.dataset.id));
    const shelves = (await Promise.all(ids.map(id => getShelf(id)))).filter(Boolean);
    shelves.forEach((shelf, idx) => {
      shelf.order = idx + 1;
    });
    await bulkSaveShelves(shelves);
  }

  DOM.btnShelfBulkDelete.addEventListener('click', async () => {
    if (selectedShelfIds.size === 0) return;
    if (!confirm(`選択した ${selectedShelfIds.size} 件のリストを棚から削除しますか？`)) return;

    await Promise.all(Array.from(selectedShelfIds).map(id => deleteShelf(id)));
    selectedShelfIds.clear();
    updateBulkDeleteBtn();
    await renderList();
    await updateBadge();
  });

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
      lastupdated: baseNow + idx
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
      lastupdated: now
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
