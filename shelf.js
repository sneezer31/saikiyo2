/** さいきよ2 - 書庫モジュール（単首/リスト枠線区別・D&D・詳細閲覧・個別/全件バックアップ・TL戻し） */

import {
  saveCard,
  loadAllCards,
  bulkSaveCards,
  loadAllShelves,
  getShelf,
  bulkSaveShelves,
  deleteShelf
} from './db.js';
import { formatDateWithWeekday } from './ui.js';

function makeTimestampStr() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${ymd}_${hm}`;
}

export function downloadTextFile(jsonStr, fileName) {
  const blob = new Blob([jsonStr], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function shareOrDownload(jsonStr, fileName, title, text) {
  const file = new File([jsonStr], fileName, { type: 'text/plain' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  downloadTextFile(jsonStr, fileName);
  alert('ファイルとして保存しました。');
}

export function initShelfModule({ onTimelineUpdated, onShelfCountChanged, onCloseWings, onOpenReader }) {
  let currentDetailShelfId = null;

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
    shelfListView: document.getElementById('shelf-list-view'),
    shelfList: document.getElementById('shelf-list'),
    shelfDetailView: document.getElementById('shelf-detail-view'),
    shelfDetailTitle: document.getElementById('shelf-detail-title'),
    shelfDetailMeta: document.getElementById('shelf-detail-meta'),
    shelfDetailMemo: document.getElementById('shelf-detail-memo'),
    shelfDetailItems: document.getElementById('shelf-detail-items'),
    btnShelfBackList: document.getElementById('btn-shelf-back-list'),
    btnShelfReader: document.getElementById('btn-shelf-reader'),
    btnShelfCopy: document.getElementById('btn-shelf-copy'),
    btnShelfBackup: document.getElementById('btn-shelf-backup'),
    btnShelfReturnScatter: document.getElementById('btn-shelf-return-scatter'),
    btnShelfReturnBlock: document.getElementById('btn-shelf-return-block'),
    // 全件バックアップ（書庫に一本化）
    btnExportShare: document.getElementById('btn-export-share'),
    btnExportFile: document.getElementById('btn-export-file')
  };

  function showListView() {
    DOM.shelfDetailView.style.display = 'none';
    DOM.shelfListView.style.display = 'block';
    currentDetailShelfId = null;
  }

  async function renderList() {
    const shelves = await loadAllShelves();
    DOM.shelfList.innerHTML = '';

    if (shelves.length === 0) {
      DOM.shelfList.innerHTML = '<div class="shelf-empty">書庫は空です。カード編集の「書庫へ」または「机へ」から保管できます。</div>';
      return;
    }

    shelves.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

    shelves.forEach(shelf => {
      const items = Array.isArray(shelf.items) ? shelf.items : [];
      const isList = items.length > 1;

      const row = document.createElement('div');
      row.className = 'shelf-row' + (isList ? ' is-list' : '');
      row.dataset.id = shelf.id;

      const main = document.createElement('div');
      main.className = 'shelf-row-main';

      const titleEl = document.createElement('div');
      titleEl.className = 'shelf-row-title';
      titleEl.textContent = shelf.title || '無題';

      const metaEl = document.createElement('div');
      metaEl.className = 'shelf-row-meta';
      const dateStr = formatDateWithWeekday(shelf.id);
      const tagStr = Array.isArray(shelf.tags) && shelf.tags.length > 0 ? '  ' + shelf.tags.join(' ') : '';
      metaEl.textContent = isList
        ? `${items.length} / ${dateStr}${tagStr}`
        : `${dateStr}${tagStr}`;

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
        if (confirm(`「${shelf.title || '無題'}」を書庫から削除しますか？\n※タイムラインの原本は消えません。`)) {
          await deleteShelf(shelf.id);
          await renderList();
          if (onShelfCountChanged) await onShelfCountChanged();
        }
      });

      controls.appendChild(handle);
      controls.appendChild(delBtn);

      row.appendChild(main);
      row.appendChild(controls);
      DOM.shelfList.appendChild(row);
    });
  }

  // --- D&D並べ替え（250ms長押し・抜け殻・時間ベース穏やかエッジスクロール） ---
  function handlePointerDown(e, row) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

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
    document.removeEventListener('pointermove', checkDragThreshold);
    document.removeEventListener('pointerup', cancelPreDrag);
    document.removeEventListener('pointercancel', cancelPreDrag);
  }

  function startDrag(e) {
    if (!drag.item) return;
    drag.isDragging = true;
    document.removeEventListener('pointermove', checkDragThreshold);
    document.removeEventListener('pointerup', cancelPreDrag);
    document.removeEventListener('pointercancel', cancelPreDrag);

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

    const panelRect = DOM.panelShelf.getBoundingClientRect();
    const dragRect = drag.item.getBoundingClientRect();
    const threshold = 72;
    const minSpeed = 70;
    const maxSpeed = 300;

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

  // --- 詳細ビュー ---
  async function openDetail(shelfId) {
    const shelf = await getShelf(shelfId);
    if (!shelf) return;

    currentDetailShelfId = shelf.id;
    DOM.shelfDetailTitle.textContent = shelf.title || '無題';

    const items = Array.isArray(shelf.items) ? shelf.items : [];
    const dateStr = formatDateWithWeekday(shelf.id);
    const tagStr = Array.isArray(shelf.tags) && shelf.tags.length > 0 ? '  ' + shelf.tags.join(' ') : '';
    DOM.shelfDetailMeta.textContent = items.length > 1
      ? `${items.length} / ${dateStr}${tagStr}`
      : `${dateStr}${tagStr}`;

    if (shelf.memo && shelf.memo.trim()) {
      DOM.shelfDetailMemo.style.display = 'block';
      DOM.shelfDetailMemo.textContent = shelf.memo;
    } else {
      DOM.shelfDetailMemo.style.display = 'none';
    }

    DOM.shelfDetailItems.innerHTML = '';
    items.forEach((item, idx) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'shelf-detail-card';

      const bodyEl = document.createElement('div');
      bodyEl.className = 'shelf-detail-card-body';
      bodyEl.textContent = item.content;

      const subEl = document.createElement('div');
      subEl.className = 'shelf-detail-card-sub';
      const itemDate = formatDateWithWeekday(item.id);
      const itemTags = Array.isArray(item.tags) && item.tags.length > 0 ? '  ' + item.tags.join(' ') : '';
      subEl.textContent = `${idx + 1}. ${itemDate}${itemTags}`;

      cardEl.appendChild(bodyEl);
      cardEl.appendChild(subEl);
      DOM.shelfDetailItems.appendChild(cardEl);
    });

    DOM.shelfListView.style.display = 'none';
    DOM.shelfDetailView.style.display = 'block';
    DOM.panelShelf.scrollTop = 0;
  }

  DOM.btnShelfBackList.addEventListener('click', showListView);

  DOM.btnShelfReader.addEventListener('click', async () => {
    if (!currentDetailShelfId) return;
    const shelf = await getShelf(currentDetailShelfId);
    if (!shelf || !Array.isArray(shelf.items)) return;
    const text = shelf.items.map(i => i.content).join('\n\n');
    if (onOpenReader) onOpenReader(shelf.title || '閲覧', text);
  });

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

  // 個別書庫バックアップ
  DOM.btnShelfBackup.addEventListener('click', async () => {
    if (!currentDetailShelfId) return;
    const shelf = await getShelf(currentDetailShelfId);
    if (!shelf) return;

    const payload = {
      app: 'saikiyo2',
      version: 2,
      type: 'shelf_backup',
      exportedAt: Date.now(),
      cards: [],
      shelves: [shelf]
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const fileName = `saikiyo2_shelf_${makeTimestampStr()}.txt`;
    await shareOrDownload(jsonStr, fileName, `さいきよ2 書庫バックアップ`, shelf.title || '無題');
  });

  async function allocateUniqueIds(count) {
    const existing = await loadAllCards();
    const idSet = new Set(existing.map(c => c.id));
    let cursor = Date.now();
    const ids = [];
    for (let i = 0; i < count; i++) {
      while (idSet.has(cursor)) cursor++;
      idSet.add(cursor);
      ids.push(cursor);
      cursor++;
    }
    return ids;
  }

  DOM.btnShelfReturnScatter.addEventListener('click', async () => {
    if (!currentDetailShelfId) return;
    const shelf = await getShelf(currentDetailShelfId);
    if (!shelf || !Array.isArray(shelf.items) || shelf.items.length === 0) return;

    const ids = await allocateUniqueIds(shelf.items.length);
    const newCards = shelf.items.map((item, idx) => ({
      id: ids[idx],
      content: item.content,
      memo: item.memo || '',
      tags: Array.isArray(item.tags) ? [...item.tags] : [],
      lastupdated: ids[idx]
    }));

    await bulkSaveCards(newCards);
    await onTimelineUpdated();
    onCloseWings();
    alert(`バラでタイムラインへ追加しました (${newCards.length})。`);
  });

  DOM.btnShelfReturnBlock.addEventListener('click', async () => {
    if (!currentDetailShelfId) return;
    const shelf = await getShelf(currentDetailShelfId);
    if (!shelf || !Array.isArray(shelf.items) || shelf.items.length === 0) return;

    const [id] = await allocateUniqueIds(1);
    const blockCard = {
      id,
      content: shelf.items.map(i => i.content).join('\n\n'),
      memo: shelf.memo || '',
      tags: Array.isArray(shelf.tags) ? [...shelf.tags] : [],
      lastupdated: id
    };

    await saveCard(blockCard);
    await onTimelineUpdated();
    onCloseWings();
    alert(`「${shelf.title || '無題'}」をまとめてタイムラインへ追加しました。`);
  });

  // --- 全件バックアップ（書庫に一本化） ---
  async function buildFullBackupPayload() {
    const [cards, shelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
    return {
      app: 'saikiyo2',
      version: 2,
      exportedAt: Date.now(),
      cards,
      shelves
    };
  }

  DOM.btnExportShare.addEventListener('click', async () => {
    const payload = await buildFullBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);
    const fileName = `saikiyo2_backup_${makeTimestampStr()}.txt`;
    await shareOrDownload(
      jsonStr,
      fileName,
      `さいきよ2 全件バックアップ`,
      `カード ${payload.cards.length} ／ 書庫 ${payload.shelves.length}`
    );
  });

  DOM.btnExportFile.addEventListener('click', async () => {
    const payload = await buildFullBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);
    downloadTextFile(jsonStr, `saikiyo2_backup_${makeTimestampStr()}.txt`);
  });

  return {
    async open() {
      showListView();
      await renderList();
    },
    renderList
  };
}
