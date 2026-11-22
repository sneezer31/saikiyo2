/** さいきよ2 - 統合ロジック（第1陣：編集パネル棚送り・作成日格上げ・誤タップ対策反映） */

import {
  initDB,
  saveCard,
  loadAllCards,
  getCard,
  bulkSaveCards,
  deleteCard,
  saveShelf,
  loadAllShelves,
  getShelf,
  bulkSaveShelves,
  deleteShelf
} from './db.js';
import { createTankaCard, updateSelectionBarUI, formatDateWithWeekday } from './ui.js';

let state = {
  suikoVisibleIds: null,
  selectedIds: new Set(),
  editingCardId: null,
  activeWing: null, // null | 'display' | 'config' | 'kansei' | 'shelf'
  selectedShelfIds: new Set(),
  currentDetailShelfId: null
};

const DOM = {
  timeline: document.getElementById('timeline'),
  btnLeftWing: document.getElementById('btn-left-wing'),
  btnTop: document.getElementById('btn-top'),
  btnRightWing: document.getElementById('btn-right-wing'),
  btnFab: document.getElementById('btn-fab'),
  footerBar: document.getElementById('footer-bar'),
  footerNormal: document.getElementById('footer-normal'),
  footerSelection: document.getElementById('footer-selection'),
  selectionCount: document.getElementById('selection-count'),
  btnBatchEdit: document.getElementById('btn-batch-edit'),
  btnCancelSelection: document.getElementById('btn-cancel-selection'),
  btnToDesk: document.getElementById('btn-to-desk'),
  consoleArea: document.getElementById('console-area'),
  inputContent: document.getElementById('input-content'),
  inputTags: document.getElementById('input-tags'),
  btnSearch: document.getElementById('btn-search'),
  btnSend: document.getElementById('btn-send'),
  panelEdit: document.getElementById('panel-edit'),
  btnCloseEdit: document.getElementById('btn-close-edit'),
  editTimestampGroup: document.getElementById('edit-timestamp-group'),
  editTimestamp: document.getElementById('edit-timestamp'),
  editContentView: document.getElementById('edit-content-view'),
  editMemo: document.getElementById('edit-memo'),
  editTags: document.getElementById('edit-tags'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  btnDeleteEdit: document.getElementById('btn-delete-edit'),
  btnCopyEdit: document.getElementById('btn-copy-edit'),
  btnShelfEdit: document.getElementById('btn-shelf-edit'),
  // 左右ウィングパネル
  panelDisplay: document.getElementById('panel-display'),
  panelConfig: document.getElementById('panel-config'),
  panelKansei: document.getElementById('panel-kansei'),
  panelShelf: document.getElementById('panel-shelf'),
  // リスト棚
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

// --- 左右ウィング・トグル制御 ---
const wingPanels = {
  display: DOM.panelDisplay,
  config: DOM.panelConfig,
  kansei: DOM.panelKansei,
  shelf: DOM.panelShelf
};

function updateHeaderWingButtons() {
  if (state.activeWing === 'display' || state.activeWing === 'config') {
    DOM.btnLeftWing.textContent = '設定';
    DOM.btnLeftWing.classList.add('is-active');
  } else {
    DOM.btnLeftWing.textContent = '表示';
    DOM.btnLeftWing.classList.remove('is-active');
  }

  if (state.activeWing === 'kansei' || state.activeWing === 'shelf') {
    DOM.btnRightWing.textContent = '棚';
    DOM.btnRightWing.classList.add('is-active');
  } else {
    DOM.btnRightWing.textContent = '管制';
    DOM.btnRightWing.classList.remove('is-active');
  }
}

async function openWing(wingName) {
  Object.values(wingPanels).forEach(p => p.classList.remove('active'));
  state.activeWing = wingName;

  if (wingName && wingPanels[wingName]) {
    wingPanels[wingName].classList.add('active');
    if (wingName === 'shelf') {
      showShelfListView();
      await renderShelfList();
    }
  }
  updateHeaderWingButtons();
}

function closeAllWings() {
  openWing(null);
}

DOM.btnLeftWing.addEventListener('click', () => {
  if (state.activeWing === 'display') {
    openWing('config');
  } else if (state.activeWing === 'config') {
    closeAllWings();
  } else {
    openWing('display');
  }
});

DOM.btnRightWing.addEventListener('click', () => {
  if (state.activeWing === 'kansei') {
    openWing('shelf');
  } else if (state.activeWing === 'shelf') {
    closeAllWings();
  } else {
    openWing('kansei');
  }
});

document.querySelectorAll('.btn-close-wing').forEach(btn => {
  btn.addEventListener('click', closeAllWings);
});

DOM.btnTop.addEventListener('click', () => {
  if (state.activeWing) closeAllWings();
  DOM.timeline.scrollTo({ top: DOM.timeline.scrollHeight, behavior: 'smooth' });
});

// --- コンソールの高さ自動計算＆吸着アルゴリズム ---
function adjustTimelinePadding() {
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');
  const activeElement = isConsoleOpen ? DOM.consoleArea : DOM.footerBar;
  const exactHeight = activeElement.offsetHeight;

  DOM.timeline.style.paddingBottom = `${exactHeight}px`;
  DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
}

window.addEventListener('resize', adjustTimelinePadding);
DOM.inputContent.addEventListener('input', adjustTimelinePadding);

function openInputConsole() {
  DOM.footerBar.style.display = 'none';
  DOM.consoleArea.classList.add('open');
  adjustTimelinePadding();
  setTimeout(() => DOM.inputContent.focus(), 100);
  history.pushState({ state: 'inputMode' }, '');
}

function closeInputConsole() {
  DOM.footerBar.style.display = 'block';
  DOM.consoleArea.classList.remove('open');
  adjustTimelinePadding();
  DOM.inputContent.blur();
  DOM.inputTags.blur();
}

DOM.btnFab.addEventListener('click', () => {
  openInputConsole();
});

window.addEventListener('popstate', () => {
  if (DOM.consoleArea.classList.contains('open')) {
    closeInputConsole();
  }
});

function handleCheckboxChange(cardId, isChecked) {
  if (isChecked) {
    state.selectedIds.add(cardId);
    if (DOM.consoleArea.classList.contains('open')) history.back();
  } else {
    state.selectedIds.delete(cardId);
  }
  updateSelectionBar();
}

async function renderTimeline() {
  const allCards = await loadAllCards();
  DOM.timeline.innerHTML = '';

  const displayCards = state.suikoVisibleIds
    ? allCards.filter(c => state.suikoVisibleIds.includes(c.id))
    : allCards;

  displayCards.sort((a, b) => a.id - b.id).forEach(card => {
    const isSelected = state.selectedIds.has(card.id);
    const cardElement = createTankaCard(card, isSelected, handleCheckboxChange, openEditPanel);
    DOM.timeline.appendChild(cardElement);
  });

  DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
}

function updateSelectionBar() {
  updateSelectionBarUI(state.selectedIds.size, DOM);
}

DOM.btnCancelSelection.addEventListener('click', () => {
  state.selectedIds.clear();
  renderTimeline();
  updateSelectionBar();
});

DOM.btnSend.addEventListener('click', async () => {
  const content = DOM.inputContent.value.trim();
  if (!content) return;

  const tags = DOM.inputTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
  const now = Date.now();
  const card = { id: now, content: content, memo: "", tags: tags, lastupdated: now };

  await saveCard(card);
  if (state.suikoVisibleIds) state.suikoVisibleIds.push(card.id);

  DOM.inputContent.value = '';
  DOM.inputTags.value = '';
  await renderTimeline();
});

DOM.btnSearch.addEventListener('click', async () => {
  const keyword = DOM.inputContent.value.trim();
  if (!keyword) {
    state.suikoVisibleIds = null;
    await renderTimeline();
    if (DOM.consoleArea.classList.contains('open')) history.back();
    return;
  }

  const allCards = await loadAllCards();
  state.suikoVisibleIds = allCards.filter(c =>
    c.content.includes(keyword) ||
    (c.tags && Array.isArray(c.tags) && c.tags.some(t => t.includes(keyword)))
  ).map(c => c.id);

  await renderTimeline();
  if (DOM.consoleArea.classList.contains('open')) history.back();
});

// --- プロパティ編集パネル ---
function openEditPanel(card) {
  state.editingCardId = card.id;
  DOM.editTimestampGroup.style.display = 'flex';
  DOM.editTimestamp.textContent = formatDateWithWeekday(card.id);
  DOM.editContentView.innerText = card.content;
  DOM.editMemo.disabled = false;
  DOM.editMemo.value = card.memo || "";
  DOM.editTags.value = card.tags && Array.isArray(card.tags) ? card.tags.join(' ') : "";

  DOM.panelEdit.classList.add('active');
}

DOM.btnCloseEdit.addEventListener('click', () => {
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

document.querySelectorAll('.helper-tag').forEach(btn => {
  btn.addEventListener('click', (e) => {
    DOM.editTags.value = (DOM.editTags.value + ' ' + e.target.innerText).trim();
  });
});

DOM.btnBatchEdit.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  state.editingCardId = 'batch';
  DOM.editTimestampGroup.style.display = 'none';
  DOM.editTimestamp.textContent = '';
  DOM.editContentView.innerText = `【一括編集モード】\n選択された ${state.selectedIds.size} 件のカードを処理します。`;
  DOM.editMemo.value = "※一括編集ではメタメモは変更できません";
  DOM.editMemo.disabled = true;
  DOM.editTags.value = "";

  DOM.panelEdit.classList.add('active');
});

DOM.btnSaveEdit.addEventListener('click', async () => {
  const newTagsInput = DOM.editTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
  const now = Date.now();

  if (state.editingCardId === 'batch') {
    const updatePromises = Array.from(state.selectedIds).map(async (id) => {
      const card = await getCard(id);
      if (card) {
        const existingTags = Array.isArray(card.tags) ? card.tags : [];
        card.tags = Array.from(new Set([...existingTags, ...newTagsInput]));
        card.lastupdated = now;
        return card;
      }
    });
    const updatedCards = (await Promise.all(updatePromises)).filter(Boolean);
    await bulkSaveCards(updatedCards);
    state.selectedIds.clear();
    updateSelectionBar();
  } else {
    const card = await getCard(state.editingCardId);
    if (card) {
      card.memo = DOM.editMemo.value;
      card.tags = newTagsInput;
      card.lastupdated = now;
      await saveCard(card);
    }
  }

  await renderTimeline();
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

DOM.btnCopyEdit.addEventListener('click', async () => {
  let contentToCopy = "";
  if (state.editingCardId === 'batch') {
    const promises = Array.from(state.selectedIds).map(id => getCard(id));
    const cards = await Promise.all(promises);
    contentToCopy = cards.filter(Boolean).map(c => c.content).join('\n\n');
  } else {
    contentToCopy = DOM.editContentView.innerText;
  }

  try {
    await navigator.clipboard.writeText(contentToCopy);
    alert('コピー完了ロボ！');
  } catch (err) {
    alert('コピーに失敗したロボ...');
  }
});

// 編集パネルから棚に収める（1首／一括 共通）
DOM.btnShelfEdit.addEventListener('click', async () => {
  const now = Date.now();
  const inputTags = DOM.editTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);

  if (state.editingCardId === 'batch') {
    const cards = (await Promise.all(Array.from(state.selectedIds).map(id => getCard(id)))).filter(Boolean);
    if (cards.length === 0) return;

    const firstClean = cards[0].content.replace(/\s+/g, '');
    const title = firstClean.slice(0, 5) || '無題';
    const items = cards.map(c => ({
      id: c.id,
      content: c.content,
      memo: c.memo || '',
      tags: Array.isArray(c.tags) ? [...c.tags] : [],
      lastupdated: c.lastupdated || c.id
    }));

    const shelf = {
      id: now,
      title,
      memo: '',
      tags: inputTags,
      items,
      order: now,
      lastupdated: now
    };
    await saveShelf(shelf);
    alert('棚に収めたロボ！');
  } else {
    const card = await getCard(state.editingCardId);
    if (!card) return;

    const firstClean = card.content.replace(/\s+/g, '');
    const title = firstClean.slice(0, 5) || '無題';
    const currentMemo = DOM.editMemo.value;

    const snapshot = {
      id: card.id,
      content: card.content,
      memo: currentMemo,
      tags: inputTags,
      lastupdated: card.lastupdated || card.id
    };

    const shelf = {
      id: now,
      title,
      memo: currentMemo,
      tags: inputTags,
      items: [snapshot],
      order: now,
      lastupdated: now
    };
    await saveShelf(shelf);
    alert('棚に収めたロボ！');
  }
});

DOM.btnDeleteEdit.addEventListener('click', async () => {
  if (state.editingCardId === 'batch') {
    if (confirm(`選択された ${state.selectedIds.size} 件のカードを一括削除するロボか？この操作は取り消せないロボ！`)) {
      const deletePromises = Array.from(state.selectedIds).map(id => deleteCard(id));
      await Promise.all(deletePromises);

      if (state.suikoVisibleIds) {
        state.suikoVisibleIds = state.suikoVisibleIds.filter(id => !state.selectedIds.has(id));
      }
      state.selectedIds.clear();
      updateSelectionBar();

      await renderTimeline();
      DOM.panelEdit.classList.remove('active');
    }
  } else {
    if (confirm('本当にこのカードを削除するロボか？この操作は取り消せないロボ！')) {
      await deleteCard(state.editingCardId);

      if (state.suikoVisibleIds) {
        state.suikoVisibleIds = state.suikoVisibleIds.filter(id => id !== state.editingCardId);
      }
      state.selectedIds.delete(state.editingCardId);
      updateSelectionBar();

      await renderTimeline();
      DOM.panelEdit.classList.remove('active');
    }
  }
});

DOM.btnToDesk.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  const ids = Array.from(state.selectedIds).join(',');
  window.location.href = `rensaku.html?ids=${ids}`;
});

// --- リスト棚パネル（一覧・D&D並べ替え・詳細・TL返却） ---
function updateShelfBulkDeleteBtn() {
  const count = state.selectedShelfIds.size;
  if (count > 0) {
    DOM.btnShelfBulkDelete.style.display = 'inline-block';
    DOM.btnShelfBulkDelete.textContent = `削除(${count})`;
  } else {
    DOM.btnShelfBulkDelete.style.display = 'none';
  }
}

function showShelfListView() {
  DOM.shelfDetailView.style.display = 'none';
  DOM.shelfListView.style.display = 'block';
  state.currentDetailShelfId = null;
}

async function renderShelfList() {
  const shelves = await loadAllShelves();
  DOM.shelfList.innerHTML = '';

  if (shelves.length === 0) {
    DOM.shelfList.innerHTML = '<div class="shelf-empty">まだリスト棚は空ロボ。<br>タイムラインからカードを選んで「机へ」→「棚に収める」で保管できるロボ。</div>';
    state.selectedShelfIds.clear();
    updateShelfBulkDeleteBtn();
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
    chk.checked = state.selectedShelfIds.has(shelf.id);
    chk.addEventListener('change', (e) => {
      if (e.target.checked) state.selectedShelfIds.add(shelf.id);
      else state.selectedShelfIds.delete(shelf.id);
      updateShelfBulkDeleteBtn();
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
    main.addEventListener('click', () => openShelfDetail(shelf.id));

    const controls = document.createElement('div');
    controls.className = 'shelf-row-controls';

    const handle = document.createElement('div');
    handle.className = 'shelf-handle';
    handle.innerHTML = '&#9776;';
    handle.addEventListener('pointerdown', (e) => startShelfDrag(e, row));

    const delBtn = document.createElement('button');
    delBtn.className = 'shelf-del-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', async () => {
      if (confirm(`「${shelf.title || '無題'}」を棚から削除するロボか？`)) {
        await deleteShelf(shelf.id);
        state.selectedShelfIds.delete(shelf.id);
        updateShelfBulkDeleteBtn();
        await renderShelfList();
      }
    });

    controls.appendChild(handle);
    controls.appendChild(delBtn);

    row.appendChild(chk);
    row.appendChild(main);
    row.appendChild(controls);
    DOM.shelfList.appendChild(row);
  });

  updateShelfBulkDeleteBtn();
}

let draggingShelfRow = null;

function startShelfDrag(e, row) {
  e.preventDefault();
  draggingShelfRow = row;
  row.classList.add('dragging');

  document.addEventListener('pointermove', onShelfDragMove, { passive: false });
  document.addEventListener('pointerup', onShelfDragEnd);
  document.addEventListener('pointercancel', onShelfDragEnd);
}

function onShelfDragMove(e) {
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

async function onShelfDragEnd() {
  if (!draggingShelfRow) return;
  draggingShelfRow.classList.remove('dragging');
  draggingShelfRow = null;

  document.removeEventListener('pointermove', onShelfDragMove);
  document.removeEventListener('pointerup', onShelfDragEnd);
  document.removeEventListener('pointercancel', onShelfDragEnd);

  const ids = Array.from(DOM.shelfList.querySelectorAll('.shelf-row')).map(el => Number(el.dataset.id));
  const shelves = (await Promise.all(ids.map(id => getShelf(id)))).filter(Boolean);
  shelves.forEach((shelf, idx) => {
    shelf.order = idx + 1;
  });
  await bulkSaveShelves(shelves);
}

DOM.btnShelfBulkDelete.addEventListener('click', async () => {
  if (state.selectedShelfIds.size === 0) return;
  if (!confirm(`選択した ${state.selectedShelfIds.size} 件のリストを棚から削除するロボか？`)) return;

  await Promise.all(Array.from(state.selectedShelfIds).map(id => deleteShelf(id)));
  state.selectedShelfIds.clear();
  updateShelfBulkDeleteBtn();
  await renderShelfList();
});

async function openShelfDetail(shelfId) {
  const shelf = await getShelf(shelfId);
  if (!shelf) return;

  state.currentDetailShelfId = shelf.id;
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

DOM.btnShelfBackList.addEventListener('click', showShelfListView);

DOM.btnShelfCopy.addEventListener('click', async () => {
  if (!state.currentDetailShelfId) return;
  const shelf = await getShelf(state.currentDetailShelfId);
  if (!shelf || !Array.isArray(shelf.items)) return;

  const text = shelf.items.map(i => i.content).join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    alert('コピー完了ロボ！');
  } catch (_) {
    alert('コピーに失敗したロボ...');
  }
});

DOM.btnShelfReturnScatter.addEventListener('click', async () => {
  if (!state.currentDetailShelfId) return;
  const shelf = await getShelf(state.currentDetailShelfId);
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
  if (state.suikoVisibleIds) {
    state.suikoVisibleIds.push(...newCards.map(c => c.id));
  }
  await renderTimeline();
  closeAllWings();
  alert(`${newCards.length}首をバラでタイムライン直近へ戻したロボ！`);
});

DOM.btnShelfReturnBlock.addEventListener('click', async () => {
  if (!state.currentDetailShelfId) return;
  const shelf = await getShelf(state.currentDetailShelfId);
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
  if (state.suikoVisibleIds) {
    state.suikoVisibleIds.push(blockCard.id);
  }
  await renderTimeline();
  closeAllWings();
  alert(`「${shelf.title || '無題'}」を塊でタイムライン直近へ戻したロボ！`);
});

// --- 起動処理 ---
window.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await renderTimeline();
  adjustTimelinePadding();

  const params = new URLSearchParams(window.location.search);
  if (params.get('open') === 'shelf') {
    await openWing('shelf');
    history.replaceState(null, '', 'saikiyo2.html');
  }
});
