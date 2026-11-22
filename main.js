/** さいきよ2 - メイン司令塔（タイムライン・論理削除/ゴミ箱・表示/設定・各モジュール接続） */

import {
  initDB,
  saveCard,
  loadAllCards,
  getCard,
  bulkSaveCards,
  deleteCard,
  saveShelf
} from './db.js';
import { createTankaCard, updateSelectionBarUI, formatDateWithWeekday } from './ui.js';
import { initShelfModule } from './shelf.js';
import { initDataManagerModule } from './dataManager.js';

const CONFIG_KEY = 'saikiyo2_config';

let config = {
  theme: 'kinari',   // 'kinari' | 'ginnezumi' | 'sumi'
  size: 'medium',    // 'small' | 'medium' | 'large'
  font: 'gothic',    // 'gothic' | 'mincho'
  radius: 'none'     // 'none' | 'soft'
};

let state = {
  viewScope: 'active',    // 'active' | 'trash'
  searchKeyword: '',
  filterTags: new Set(),  // タグ名 または '__NO_TAG__'
  filterDateFrom: '',
  filterDateTo: '',
  sortOrder: 'asc',       // 'asc' | 'desc'
  memoMode: 'badge',      // 'badge' | 'full'
  selectedIds: new Set(),
  editingCardId: null,
  activeWing: null        // null | 'display' | 'config' | 'data' | 'shelf'
};

const DOM = {
  timeline: document.getElementById('timeline'),
  btnLeftWing: document.getElementById('btn-left-wing'),
  btnTop: document.getElementById('btn-top'),
  btnRightWing: document.getElementById('btn-right-wing'),
  btnOpenShelf: document.getElementById('btn-open-shelf'),
  btnFab: document.getElementById('btn-fab'),
  trashModeBanner: document.getElementById('trash-mode-banner'),
  btnExitTrashMode: document.getElementById('btn-exit-trash-mode'),
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
  editRestoreRow: document.getElementById('edit-restore-row'),
  btnRestoreEdit: document.getElementById('btn-restore-edit'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  btnDeleteEdit: document.getElementById('btn-delete-edit'),
  btnCopyEdit: document.getElementById('btn-copy-edit'),
  btnShelfEdit: document.getElementById('btn-shelf-edit'),
  // ウィングパネル
  panelDisplay: document.getElementById('panel-display'),
  panelConfig: document.getElementById('panel-config'),
  panelData: document.getElementById('panel-data'),
  panelShelf: document.getElementById('panel-shelf'),
  // 表示パネル
  btnDisplayReset: document.getElementById('btn-display-reset'),
  displayStatus: document.getElementById('display-status'),
  btnScopeTrash: document.getElementById('btn-scope-trash'),
  displayTagList: document.getElementById('display-tag-list'),
  filterDateFrom: document.getElementById('filter-date-from'),
  filterDateTo: document.getElementById('filter-date-to')
};

// --- サブモジュール初期化 ---
const shelfModule = initShelfModule({
  onTimelineUpdated: renderTimeline,
  onCloseWings: closeAllWings
});

const dataManagerModule = initDataManagerModule({
  onDataChanged: async () => {
    await renderTimeline();
    await shelfModule.updateBadge();
  },
  onCardsDeleted: async (deletedIdSet) => {
    deletedIdSet.forEach(id => state.selectedIds.delete(id));
    updateSelectionBar();
    await renderTimeline();
  }
});

// --- 設定（コンフィグ） ---
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if (saved) config = { ...config, ...saved };
  } catch (_) {}
  applyConfig();
}

function saveConfig() {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (_) {}
}

function applyConfig() {
  document.body.dataset.theme = config.theme;
  document.body.dataset.size = config.size;
  document.body.dataset.font = config.font;
  document.body.dataset.radius = config.radius;

  document.querySelectorAll('[data-config-theme]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.configTheme === config.theme);
  });
  document.querySelectorAll('[data-config-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.configSize === config.size);
  });
  document.querySelectorAll('[data-config-font]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.configFont === config.font);
  });
  document.querySelectorAll('[data-config-radius]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.configRadius === config.radius);
  });
}

document.querySelectorAll('[data-config-theme]').forEach(btn => {
  btn.addEventListener('click', () => { config.theme = btn.dataset.configTheme; applyConfig(); saveConfig(); });
});
document.querySelectorAll('[data-config-size]').forEach(btn => {
  btn.addEventListener('click', () => { config.size = btn.dataset.configSize; applyConfig(); saveConfig(); });
});
document.querySelectorAll('[data-config-font]').forEach(btn => {
  btn.addEventListener('click', () => { config.font = btn.dataset.configFont; applyConfig(); saveConfig(); });
});
document.querySelectorAll('[data-config-radius]').forEach(btn => {
  btn.addEventListener('click', () => { config.radius = btn.dataset.configRadius; applyConfig(); saveConfig(); });
});

// --- ウィングパネル制御 ---
const wingPanels = {
  display: DOM.panelDisplay,
  config: DOM.panelConfig,
  data: DOM.panelData,
  shelf: DOM.panelShelf
};

function hasActiveFilter() {
  return Boolean(
    state.searchKeyword ||
    state.filterTags.size > 0 ||
    state.filterDateFrom ||
    state.filterDateTo
  );
}

function updateHeaderWingButtons() {
  const filterMark = hasActiveFilter() ? '●' : '';

  if (state.activeWing === 'display' || state.activeWing === 'config') {
    DOM.btnLeftWing.textContent = '設定';
    DOM.btnLeftWing.classList.add('is-active');
  } else if (state.viewScope === 'trash') {
    DOM.btnLeftWing.textContent = `表示(ゴミ箱)${filterMark}`;
    DOM.btnLeftWing.classList.remove('is-active');
  } else {
    DOM.btnLeftWing.textContent = `表示${filterMark}`;
    DOM.btnLeftWing.classList.remove('is-active');
  }

  DOM.btnRightWing.classList.toggle('is-active', state.activeWing === 'data');
  DOM.trashModeBanner.style.display = state.viewScope === 'trash' ? 'flex' : 'none';
}

async function openWing(wingName) {
  Object.values(wingPanels).forEach(p => p.classList.remove('active'));
  state.activeWing = wingName;

  if (wingName && wingPanels[wingName]) {
    wingPanels[wingName].classList.add('active');
    if (wingName === 'display') {
      await renderDisplayPanel();
    } else if (wingName === 'shelf') {
      await shelfModule.open();
    } else if (wingName === 'data') {
      await dataManagerModule.updateStats();
    }
  }
  updateHeaderWingButtons();
}

function closeAllWings() {
  openWing(null);
}

DOM.btnLeftWing.addEventListener('click', () => {
  if (state.activeWing === 'display') openWing('config');
  else if (state.activeWing === 'config') closeAllWings();
  else openWing('display');
});

DOM.btnRightWing.addEventListener('click', () => {
  if (state.activeWing === 'data') closeAllWings();
  else openWing('data');
});

DOM.btnOpenShelf.addEventListener('click', () => {
  if (state.activeWing === 'shelf') closeAllWings();
  else openWing('shelf');
});

document.querySelectorAll('.btn-close-wing').forEach(btn => {
  btn.addEventListener('click', closeAllWings);
});

DOM.btnExitTrashMode.addEventListener('click', async () => {
  state.viewScope = 'active';
  state.selectedIds.clear();
  updateSelectionBar();
  await renderTimeline();
  updateHeaderWingButtons();
});

DOM.btnTop.addEventListener('click', () => {
  if (state.activeWing) closeAllWings();
  const targetTop = state.sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
  DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
});

// --- 表示パネル（対象切替・絞り込み・並び順・メモ表示） ---
function filterByScope(allCards) {
  return state.viewScope === 'trash'
    ? allCards.filter(c => Boolean(c.deletedAt))
    : allCards.filter(c => !c.deletedAt);
}

function filterCards(allCards) {
  let result = filterByScope(allCards);

  if (state.searchKeyword) {
    const kw = state.searchKeyword;
    result = result.filter(c =>
      c.content.includes(kw) ||
      (c.memo && c.memo.includes(kw)) ||
      (Array.isArray(c.tags) && c.tags.some(t => t.includes(kw)))
    );
  }

  if (state.filterTags.size > 0) {
    result = result.filter(c => {
      const cardTags = Array.isArray(c.tags) ? c.tags : [];
      for (const reqTag of state.filterTags) {
        if (reqTag === '__NO_TAG__') {
          if (cardTags.length > 0) return false;
        } else {
          if (!cardTags.includes(reqTag)) return false;
        }
      }
      return true;
    });
  }

  if (state.filterDateFrom) {
    const fromTs = new Date(`${state.filterDateFrom}T00:00:00`).getTime();
    if (!Number.isNaN(fromTs)) result = result.filter(c => c.id >= fromTs);
  }

  if (state.filterDateTo) {
    const toTs = new Date(`${state.filterDateTo}T23:59:59.999`).getTime();
    if (!Number.isNaN(toTs)) result = result.filter(c => c.id <= toTs);
  }

  return result;
}

async function renderDisplayPanel() {
  const allCards = await loadAllCards();
  const scopedCards = filterByScope(allCards);
  const filtered = filterCards(allCards);
  const trashCount = allCards.filter(c => Boolean(c.deletedAt)).length;

  if (DOM.btnScopeTrash) {
    DOM.btnScopeTrash.textContent = `ゴミ箱 (${trashCount})`;
  }
  document.querySelectorAll('[data-scope]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scope === state.viewScope);
  });

  const scopeLabel = state.viewScope === 'trash' ? 'ゴミ箱' : '通常';
  if (hasActiveFilter()) {
    const kwNote = state.searchKeyword ? `（検索: ${state.searchKeyword}）` : '';
    DOM.displayStatus.textContent = `${scopeLabel}を絞り込み中：${filtered.length} / ${scopedCards.length} 件${kwNote}`;
  } else {
    DOM.displayStatus.textContent = `${scopeLabel}を全件表示中：${scopedCards.length} 件`;
  }

  const tagCounts = new Map();
  let noTagCount = 0;
  scopedCards.forEach(c => {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    if (tags.length === 0) noTagCount++;
    else tags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
  });

  DOM.displayTagList.innerHTML = '';

  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  sortedTags.forEach(([tag, count]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip' + (state.filterTags.has(tag) ? ' active' : '');
    btn.textContent = `${tag} (${count})`;
    btn.addEventListener('click', async () => {
      if (state.filterTags.has(tag)) state.filterTags.delete(tag);
      else state.filterTags.add(tag);
      await renderTimeline();
      await renderDisplayPanel();
      updateHeaderWingButtons();
    });
    DOM.displayTagList.appendChild(btn);
  });

  if (noTagCount > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip' + (state.filterTags.has('__NO_TAG__') ? ' active' : '');
    btn.textContent = `タグなし (${noTagCount})`;
    btn.addEventListener('click', async () => {
      if (state.filterTags.has('__NO_TAG__')) state.filterTags.delete('__NO_TAG__');
      else state.filterTags.add('__NO_TAG__');
      await renderTimeline();
      await renderDisplayPanel();
      updateHeaderWingButtons();
    });
    DOM.displayTagList.appendChild(btn);
  }

  if (sortedTags.length === 0 && noTagCount === 0) {
    DOM.displayTagList.innerHTML = `<span style="color:var(--muted-color); font-size:0.85rem;">${scopeLabel}にカードはありません。</span>`;
  }

  DOM.filterDateFrom.value = state.filterDateFrom;
  DOM.filterDateTo.value = state.filterDateTo;

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.sortOrder);
  });
  document.querySelectorAll('[data-memo-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.memoMode === state.memoMode);
  });
}

document.querySelectorAll('[data-scope]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const nextScope = btn.dataset.scope;
    if (state.viewScope === nextScope) return;
    state.viewScope = nextScope;
    state.selectedIds.clear();
    updateSelectionBar();
    await renderTimeline();
    await renderDisplayPanel();
    updateHeaderWingButtons();
  });
});

DOM.btnDisplayReset.addEventListener('click', async () => {
  state.viewScope = 'active';
  state.searchKeyword = '';
  state.filterTags.clear();
  state.filterDateFrom = '';
  state.filterDateTo = '';
  state.selectedIds.clear();
  updateSelectionBar();
  await renderTimeline();
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

DOM.filterDateFrom.addEventListener('change', async () => {
  state.filterDateFrom = DOM.filterDateFrom.value;
  await renderTimeline();
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

DOM.filterDateTo.addEventListener('change', async () => {
  state.filterDateTo = DOM.filterDateTo.value;
  await renderTimeline();
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

document.querySelectorAll('[data-sort]').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.sortOrder = btn.dataset.sort;
    await renderTimeline();
    await renderDisplayPanel();
  });
});

document.querySelectorAll('[data-memo-mode]').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.memoMode = btn.dataset.memoMode;
    await renderTimeline();
    await renderDisplayPanel();
  });
});

// --- コンソール＆タイムライン ---
function adjustTimelinePadding() {
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');
  const activeElement = isConsoleOpen ? DOM.consoleArea : DOM.footerBar;
  DOM.timeline.style.paddingBottom = `${activeElement.offsetHeight}px`;
  if (state.sortOrder === 'asc') {
    DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
  }
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

DOM.btnFab.addEventListener('click', openInputConsole);

window.addEventListener('popstate', () => {
  if (DOM.consoleArea.classList.contains('open')) closeInputConsole();
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

  const displayCards = filterCards(allCards);
  displayCards.sort((a, b) => (state.sortOrder === 'desc' ? b.id - a.id : a.id - b.id));

  const showMemoFull = state.memoMode === 'full';
  displayCards.forEach(card => {
    const isSelected = state.selectedIds.has(card.id);
    const cardElement = createTankaCard(card, isSelected, handleCheckboxChange, openEditPanel, showMemoFull);
    DOM.timeline.appendChild(cardElement);
  });

  DOM.timeline.scrollTop = state.sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
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
  await saveCard({ id: now, content, memo: '', tags, lastupdated: now, deletedAt: null });

  DOM.inputContent.value = '';
  DOM.inputTags.value = '';
  if (state.viewScope === 'trash') {
    state.viewScope = 'active';
    updateHeaderWingButtons();
  }
  await renderTimeline();
});

DOM.btnSearch.addEventListener('click', async () => {
  state.searchKeyword = DOM.inputContent.value.trim();
  await renderTimeline();
  updateHeaderWingButtons();
  if (DOM.consoleArea.classList.contains('open')) history.back();
});

// --- 詳細・編集パネル（論理削除＆ゴミ箱からの復元対応） ---
function configureEditTrashButtons(isTrashMode) {
  DOM.editRestoreRow.style.display = isTrashMode ? 'flex' : 'none';
  DOM.btnDeleteEdit.textContent = isTrashMode ? '完全削除' : 'ゴミ箱へ';
}

function openEditPanel(card) {
  state.editingCardId = card.id;
  DOM.editTimestampGroup.style.display = 'flex';
  const deletedNote = card.deletedAt ? ` ／ ゴミ箱移動: ${formatDateWithWeekday(card.deletedAt)}` : '';
  DOM.editTimestamp.textContent = `${formatDateWithWeekday(card.id)}${deletedNote}`;
  DOM.editContentView.innerText = card.content;
  DOM.editMemo.disabled = false;
  DOM.editMemo.value = card.memo || '';
  DOM.editTags.value = Array.isArray(card.tags) ? card.tags.join(' ') : '';
  configureEditTrashButtons(Boolean(card.deletedAt));
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
  DOM.editMemo.value = '※一括編集ではメモは変更できません';
  DOM.editMemo.disabled = true;
  DOM.editTags.value = '';
  configureEditTrashButtons(state.viewScope === 'trash');
  DOM.panelEdit.classList.add('active');
});

DOM.btnSaveEdit.addEventListener('click', async () => {
  const newTagsInput = DOM.editTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
  const now = Date.now();

  if (state.editingCardId === 'batch') {
    const updatedCards = (await Promise.all(Array.from(state.selectedIds).map(async (id) => {
      const card = await getCard(id);
      if (!card) return null;
      const existingTags = Array.isArray(card.tags) ? card.tags : [];
      card.tags = Array.from(new Set([...existingTags, ...newTagsInput]));
      card.lastupdated = now;
      return card;
    }))).filter(Boolean);

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

// ゴミ箱から戻す（論理削除の解除）
DOM.btnRestoreEdit.addEventListener('click', async () => {
  const now = Date.now();

  if (state.editingCardId === 'batch') {
    const updatedCards = (await Promise.all(Array.from(state.selectedIds).map(async (id) => {
      const card = await getCard(id);
      if (!card) return null;
      card.deletedAt = null;
      card.lastupdated = now;
      return card;
    }))).filter(Boolean);

    await bulkSaveCards(updatedCards);
    state.selectedIds.clear();
    updateSelectionBar();
  } else {
    const card = await getCard(state.editingCardId);
    if (card) {
      card.deletedAt = null;
      card.lastupdated = now;
      await saveCard(card);
      state.selectedIds.delete(card.id);
      updateSelectionBar();
    }
  }

  await renderTimeline();
  await dataManagerModule.checkMonthlyTrashReminder();
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

DOM.btnCopyEdit.addEventListener('click', async () => {
  let contentToCopy = '';
  if (state.editingCardId === 'batch') {
    const cards = (await Promise.all(Array.from(state.selectedIds).map(id => getCard(id)))).filter(Boolean);
    contentToCopy = cards.map(c => c.content).join('\n\n');
  } else {
    contentToCopy = DOM.editContentView.innerText;
  }

  try {
    await navigator.clipboard.writeText(contentToCopy);
    alert('コピーしました。');
  } catch (_) {
    alert('コピーに失敗しました。');
  }
});

DOM.btnShelfEdit.addEventListener('click', async () => {
  const now = Date.now();
  const inputTags = DOM.editTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);

  if (state.editingCardId === 'batch') {
    const cards = (await Promise.all(Array.from(state.selectedIds).map(id => getCard(id)))).filter(Boolean);
    if (cards.length === 0) return;

    const title = cards[0].content.replace(/\s+/g, '').slice(0, 5) || '無題';
    const items = cards.map(c => ({
      id: c.id,
      content: c.content,
      memo: c.memo || '',
      tags: Array.isArray(c.tags) ? [...c.tags] : [],
      lastupdated: c.lastupdated || c.id
    }));

    await saveShelf({ id: now, title, memo: '', tags: inputTags, items, order: now, lastupdated: now });
  } else {
    const card = await getCard(state.editingCardId);
    if (!card) return;

    const title = card.content.replace(/\s+/g, '').slice(0, 5) || '無題';
    const currentMemo = DOM.editMemo.value;
    const snapshot = {
      id: card.id,
      content: card.content,
      memo: currentMemo,
      tags: inputTags,
      lastupdated: card.lastupdated || card.id
    };

    await saveShelf({ id: now, title, memo: currentMemo, tags: inputTags, items: [snapshot], order: now, lastupdated: now });
  }

  await shelfModule.updateBadge();
  alert('棚に収めました。');
});

// 削除ボタン：通常時は論理削除（ゴミ箱移動）、ゴミ箱表示中は物理削除
DOM.btnDeleteEdit.addEventListener('click', async () => {
  const now = Date.now();
  const isTrashMode = state.editingCardId === 'batch'
    ? state.viewScope === 'trash'
    : Boolean((await getCard(state.editingCardId))?.deletedAt);

  if (state.editingCardId === 'batch') {
    if (isTrashMode) {
      if (!confirm(`選択された ${state.selectedIds.size} 件を完全に削除しますか？この操作は取り消せません。`)) return;
      await Promise.all(Array.from(state.selectedIds).map(id => deleteCard(id)));
    } else {
      const updatedCards = (await Promise.all(Array.from(state.selectedIds).map(async (id) => {
        const card = await getCard(id);
        if (!card) return null;
        card.deletedAt = now;
        card.lastupdated = now;
        return card;
      }))).filter(Boolean);
      await bulkSaveCards(updatedCards);
    }
    state.selectedIds.clear();
  } else {
    if (isTrashMode) {
      if (!confirm('このカードを完全に削除しますか？この操作は取り消せません。')) return;
      await deleteCard(state.editingCardId);
    } else {
      const card = await getCard(state.editingCardId);
      if (card) {
        card.deletedAt = now;
        card.lastupdated = now;
        await saveCard(card);
      }
    }
    state.selectedIds.delete(state.editingCardId);
  }

  updateSelectionBar();
  await renderTimeline();
  await dataManagerModule.checkMonthlyTrashReminder();
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

DOM.btnToDesk.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  const ids = Array.from(state.selectedIds).join(',');
  window.location.href = `rensaku.html?ids=${ids}`;
});

// --- 起動処理 ---
window.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  await initDB();
  await renderTimeline();
  await shelfModule.updateBadge();
  updateHeaderWingButtons();
  adjustTimelinePadding();
  await dataManagerModule.checkMonthlyTrashReminder();

  const params = new URLSearchParams(window.location.search);
  if (params.get('open') === 'shelf') {
    await openWing('shelf');
    history.replaceState(null, '', 'saikiyo2.html');
  }
});
