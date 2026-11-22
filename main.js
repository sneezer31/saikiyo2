/** さいきよ2 - 統合ロジック（UI浄化・排他制御・#自動付与・スキーマ完全準拠・一括処理対応） */

import { initDB, saveCard, loadAllCards, getCard, bulkSaveCards, deleteCard } from './db.js';
import { createTankaCard, updateSelectionBarUI, formatDateWithWeekday } from './ui.js';

let state = { suikoVisibleIds: null, selectedIds: new Set(), editingCardId: null };

const DOM = {
  timeline: document.getElementById('timeline'),
  btnTop: document.getElementById('btn-top'),
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
  editTimestamp: document.getElementById('edit-timestamp'),
  editContentView: document.getElementById('edit-content-view'),
  editMemo: document.getElementById('edit-memo'),
  editTags: document.getElementById('edit-tags'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  btnDeleteEdit: document.getElementById('btn-delete-edit'), 
  btnCopyEdit: document.getElementById('btn-copy-edit')      
};

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
// ----------------------------------------------------

DOM.btnTop.addEventListener('click', () => {
  DOM.timeline.scrollTo({ top: DOM.timeline.scrollHeight, behavior: 'smooth' });
});

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

window.addEventListener('popstate', (e) => {
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

function openEditPanel(card) {
  state.editingCardId = card.id;
  DOM.editTimestamp.textContent = formatDateWithWeekday(card.id);
  DOM.editTimestamp.style.display = 'block';
  DOM.editContentView.innerText = card.content;
  DOM.editMemo.disabled = false;
  DOM.editMemo.value = card.memo || "";
  DOM.editTags.value = card.tags && Array.isArray(card.tags) ? card.tags.join(' ') : "";
  
  // UI共通化：常にボタンを表示
  DOM.btnDeleteEdit.style.display = '';
  DOM.btnCopyEdit.style.display = '';
  
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
  DOM.editTimestamp.textContent = '';
  DOM.editTimestamp.style.display = 'none';
  DOM.editContentView.innerText = `【一括編集モード】\n選択された ${state.selectedIds.size} 件のカードを処理します。`;
  DOM.editMemo.value = "※一括編集ではメタメモは変更できません";
  DOM.editMemo.disabled = true;
  DOM.editTags.value = "";
  
  // UI共通化：一括編集時もボタンは消さない
  DOM.btnDeleteEdit.style.display = '';
  DOM.btnCopyEdit.style.display = '';
  
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

// 新設：統合コピペロジック（1行空きマージ対応）
DOM.btnCopyEdit.addEventListener('click', async () => {
  let contentToCopy = "";
  if (state.editingCardId === 'batch') {
    // 選択された全カードの本文を抽出し、「\n\n」で結合
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

// 新設：統合削除ロジック（一括削除対応）
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

window.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await renderTimeline();
  adjustTimelinePadding();
});
