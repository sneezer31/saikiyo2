/** さいきよ2 - データ管理モジュール（差分取り込み・古いID絶対保護・初代全ステイタスタグ化・重複整理・ローカル隔離ゴミ箱） */

import {
  saveCard,
  loadAllCards,
  bulkSaveCards,
  deleteCard,
  loadAllShelves,
  bulkSaveShelves
} from './db.js';
import { formatDateWithWeekday } from './ui.js';
import { downloadTextFile } from './shelf.js';

const TRASH_STORAGE_KEY = 'saikiyo2_trash_box';

function loadTrashList() {
  try {
    const raw = JSON.parse(localStorage.getItem(TRASH_STORAGE_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function saveTrashList(list) {
  try {
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error(err);
    alert('ゴミ箱の保存領域がいっぱいです。ゴミ箱をバックアップして空にしてください。');
  }
}

function makeTimestampStr() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${ymd}_${hm}`;
}

export function initDataManagerModule({ onDataChanged, onCardsDeleted }) {
  const DOM = {
    stats: document.getElementById('data-stats'),
    btnImportFile: document.getElementById('btn-import-file'),
    inputImportFile: document.getElementById('input-import-file'),
    inputImportText: document.getElementById('input-import-text'),
    btnImportText: document.getElementById('btn-import-text'),
    inputBulkText: document.getElementById('input-bulk-text'),
    inputBulkTags: document.getElementById('input-bulk-tags'),
    btnBulkImport: document.getElementById('btn-bulk-import'),
    btnDedupeCards: document.getElementById('btn-dedupe-cards'),
    trashList: document.getElementById('trash-list'),
    btnTrashEmpty: document.getElementById('btn-trash-empty')
  };

  // 旧版でIndexedDB内にdeletedAt付きで入っていたカードをローカルゴミ箱へ自動隔離
  async function migrateLegacyTrash() {
    const allCards = await loadAllCards();
    const legacyTrashed = allCards.filter(c => Boolean(c.deletedAt));
    if (legacyTrashed.length === 0) return;

    const currentTrash = loadTrashList();
    const trashIds = new Set(currentTrash.map(c => c.id));
    legacyTrashed.forEach(c => {
      if (!trashIds.has(c.id)) {
        currentTrash.push(c);
        trashIds.add(c.id);
      }
    });
    saveTrashList(currentTrash);
    await Promise.all(legacyTrashed.map(c => deleteCard(c.id)));
  }

  async function moveCardsToTrash(cards) {
    if (!Array.isArray(cards) || cards.length === 0) return;
    const now = Date.now();
    const currentTrash = loadTrashList();
    const trashMap = new Map(currentTrash.map(c => [c.id, c]));

    cards.forEach(c => {
      trashMap.set(c.id, {
        id: c.id,
        content: c.content,
        memo: c.memo || '',
        tags: Array.isArray(c.tags) ? [...c.tags] : [],
        lastupdated: c.lastupdated || c.id,
        deletedAt: now
      });
    });

    saveTrashList(Array.from(trashMap.values()));
    await Promise.all(cards.map(c => deleteCard(c.id)));
    renderTrashList();
  }

  async function updateStats() {
    const [cards, shelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
    if (DOM.stats) {
      DOM.stats.textContent = `タイムライン ${cards.length} ／ 書庫 ${shelves.length}`;
    }
    renderTrashList();
  }

  function renderTrashList() {
    if (!DOM.trashList) return;
    const trash = loadTrashList().sort((a, b) => (b.deletedAt || b.id) - (a.deletedAt || a.id));
    DOM.trashList.innerHTML = '';

    if (DOM.btnTrashEmpty) {
      DOM.btnTrashEmpty.disabled = trash.length === 0;
    }

    if (trash.length === 0) {
      DOM.trashList.innerHTML = '<div class="shelf-empty">ゴミ箱は空です。</div>';
      return;
    }

    trash.forEach(item => {
      const row = document.createElement('div');
      row.className = 'trash-row';

      const bodyWrap = document.createElement('div');
      bodyWrap.className = 'trash-row-body';
      bodyWrap.textContent = item.content;

      const meta = document.createElement('div');
      meta.className = 'trash-row-meta';
      const tagsStr = Array.isArray(item.tags) && item.tags.length > 0 ? '  ' + item.tags.join(' ') : '';
      meta.textContent = `${formatDateWithWeekday(item.id)}${tagsStr}`;
      bodyWrap.appendChild(meta);

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'trash-restore-btn';
      restoreBtn.textContent = '戻す';
      restoreBtn.addEventListener('click', async () => {
        const existingCards = await loadAllCards();
        const existingIds = new Set(existingCards.map(c => c.id));
        let targetId = item.id;
        // 元のIDがすでにタイムラインにある場合は古い方を守り、1msズラして戻す
        while (existingIds.has(targetId)) targetId++;

        await saveCard({
          id: targetId,
          content: item.content,
          memo: item.memo || '',
          tags: Array.isArray(item.tags) ? [...item.tags] : [],
          lastupdated: Date.now()
        });

        const nextTrash = loadTrashList().filter(t => t.id !== item.id);
        saveTrashList(nextTrash);
        await onDataChanged();
        await updateStats();
      });

      row.appendChild(bodyWrap);
      row.appendChild(restoreBtn);
      DOM.trashList.appendChild(row);
    });
  }

  if (DOM.btnTrashEmpty) {
    DOM.btnTrashEmpty.addEventListener('click', async () => {
      const trash = loadTrashList();
      if (trash.length === 0) return;

      const payload = {
        app: 'saikiyo2',
        version: 2,
        type: 'trash_archive',
        exportedAt: Date.now(),
        cards: trash,
        shelves: []
      };
      const fileName = `saikiyo2_trash_${makeTimestampStr()}.txt`;
      downloadTextFile(JSON.stringify(payload, null, 2), fileName);

      if (!confirm(`ゴミ箱のバックアップ（${fileName}）を保存しました。\n\nこのままゴミ箱を空にしますか？（${trash.length}・取り消し不可）`)) {
        return;
      }

      saveTrashList([]);
      renderTrashList();
      alert('ゴミ箱を空にしました。');
    });
  }

  // 初代ステイタスを含め、付いているステイタスは間引かずすべて #タグ 化
  function normalizeTags(rawTags, status, publishStatus) {
    const tagSet = new Set();
    const addTag = (t) => {
      const cleaned = String(t || '').trim();
      if (!cleaned) return;
      tagSet.add(cleaned.startsWith('#') ? cleaned : '#' + cleaned);
    };

    if (Array.isArray(rawTags)) {
      rawTags.forEach(addTag);
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      rawTags.trim().split(/\s+/).forEach(addTag);
    }

    if (typeof status === 'string' && status.trim()) addTag(status);
    if (typeof publishStatus === 'string' && publishStatus.trim()) addTag(publishStatus);

    return Array.from(tagSet);
  }

  function normalizeCard(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const content = typeof raw.content === 'string'
      ? raw.content
      : (typeof raw.text === 'string' ? raw.text : (typeof raw.body === 'string' ? raw.body : null));
    if (content === null) return null;

    const idNum = Number(raw.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : fallbackId;
    const deletedAtNum = raw.deletedAt ? Number(raw.deletedAt) : null;

    return {
      id,
      content,
      memo: typeof raw.memo === 'string' ? raw.memo : '',
      tags: normalizeTags(raw.tags, raw.status, raw.publish_status),
      lastupdated: Number(raw.lastupdated) || id,
      _legacyDeletedAt: (deletedAtNum && !Number.isNaN(deletedAtNum)) ? deletedAtNum : null
    };
  }

  function convertLegacyListToShelf(rawList, cardLookupMap, fallbackId) {
    const idNum = Number(rawList.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : fallbackId;
    const title = (typeof rawList.content === 'string' && rawList.content.trim())
      ? rawList.content.trim()
      : '無題';

    const rawItemIds = Array.isArray(rawList.items) ? rawList.items : [];
    const items = [];

    rawItemIds.forEach((itemRef, idx) => {
      if (itemRef && typeof itemRef === 'object' && typeof itemRef.content === 'string') {
        const c = normalizeCard(itemRef, id + idx + 1);
        if (c) {
          items.push({
            id: c.id,
            content: c.content,
            memo: c.memo,
            tags: c.tags,
            lastupdated: c.lastupdated
          });
        }
        return;
      }
      const found = cardLookupMap.get(Number(itemRef));
      if (found) {
        items.push({
          id: found.id,
          content: found.content,
          memo: found.memo || '',
          tags: Array.isArray(found.tags) ? [...found.tags] : [],
          lastupdated: found.lastupdated || found.id
        });
      }
    });

    return {
      id,
      title,
      memo: typeof rawList.memo === 'string' ? rawList.memo : '',
      tags: normalizeTags(rawList.tags, rawList.status, rawList.publish_status),
      items,
      order: Number(rawList.order) || id,
      lastupdated: Number(rawList.lastupdated) || id
    };
  }

  function normalizeV2Shelf(rawShelf, fallbackId) {
    if (!rawShelf || typeof rawShelf !== 'object' || !Array.isArray(rawShelf.items)) return null;
    const idNum = Number(rawShelf.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : fallbackId;

    const items = rawShelf.items
      .map((item, idx) => {
        const c = normalizeCard(item, id + idx + 1);
        if (!c) return null;
        return {
          id: c.id,
          content: c.content,
          memo: c.memo,
          tags: c.tags,
          lastupdated: c.lastupdated
        };
      })
      .filter(Boolean);

    return {
      id,
      title: (typeof rawShelf.title === 'string' && rawShelf.title.trim()) ? rawShelf.title.trim() : '無題',
      memo: typeof rawShelf.memo === 'string' ? rawShelf.memo : '',
      tags: normalizeTags(rawShelf.tags),
      items,
      order: Number(rawShelf.order) || id,
      lastupdated: Number(rawShelf.lastupdated) || id
    };
  }

  // --- ファイル取り込み（差分：同一IDは古い原本を絶対に残す） ---
  async function importBackupJson(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch (_) {
      alert('正しいJSON形式ではありません。');
      return;
    }

    const [existingCards, existingShelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
    const existingCardIds = new Set(existingCards.map(c => c.id));
    const existingShelfIds = new Set(existingShelves.map(s => s.id));
    const cardLookupMap = new Map(existingCards.map(c => [c.id, c]));

    const rawCardItems = [];
    const rawLegacyLists = [];
    const rawV2Shelves = [];
    const isTrashArchive = Boolean(parsed && !Array.isArray(parsed) && parsed.type === 'trash_archive');

    if (Array.isArray(parsed)) {
      parsed.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        if (entry.type === 'list') rawLegacyLists.push(entry);
        else rawCardItems.push(entry);
      });
    } else if (parsed && typeof parsed === 'object') {
      const sourceCards = Array.isArray(parsed.cards)
        ? parsed.cards
        : (Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed.items) ? parsed.items : []));

      sourceCards.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        if (entry.type === 'list') rawLegacyLists.push(entry);
        else rawCardItems.push(entry);
      });

      if (Array.isArray(parsed.shelves)) {
        rawV2Shelves.push(...parsed.shelves);
      }
    }

    let fallbackCursor = Date.now();
    const cardsToAdd = [];
    const trashedToIsolate = [];
    let skippedCards = 0;

    rawCardItems.forEach(raw => {
      const normalized = normalizeCard(raw, fallbackCursor++);
      if (!normalized) return;

      if (!cardLookupMap.has(normalized.id)) {
        cardLookupMap.set(normalized.id, normalized);
      }

      if (existingCardIds.has(normalized.id)) {
        skippedCards++;
        return;
      }

      existingCardIds.add(normalized.id);
      const cleanCard = {
        id: normalized.id,
        content: normalized.content,
        memo: normalized.memo,
        tags: normalized.tags,
        lastupdated: normalized.lastupdated
      };

      if (!isTrashArchive && normalized._legacyDeletedAt) {
        trashedToIsolate.push({ ...cleanCard, deletedAt: normalized._legacyDeletedAt });
      } else {
        cardsToAdd.push(cleanCard);
      }
    });

    const shelvesToAdd = [];
    let skippedShelves = 0;

    rawV2Shelves.forEach(rawShelf => {
      const s = normalizeV2Shelf(rawShelf, fallbackCursor++);
      if (!s) return;
      if (existingShelfIds.has(s.id)) {
        skippedShelves++;
        return;
      }
      existingShelfIds.add(s.id);
      shelvesToAdd.push(s);
    });

    rawLegacyLists.forEach(rawList => {
      const s = convertLegacyListToShelf(rawList, cardLookupMap, fallbackCursor++);
      if (existingShelfIds.has(s.id)) {
        skippedShelves++;
        return;
      }
      existingShelfIds.add(s.id);
      shelvesToAdd.push(s);
    });

    if (cardsToAdd.length === 0 && shelvesToAdd.length === 0 && trashedToIsolate.length === 0) {
      alert(`新しく追加するデータはありませんでした（既存保護スキップ：カード ${skippedCards} ／ 書庫 ${skippedShelves}）。`);
      return;
    }

    if (cardsToAdd.length > 0) await bulkSaveCards(cardsToAdd);
    if (shelvesToAdd.length > 0) await bulkSaveShelves(shelvesToAdd);
    if (trashedToIsolate.length > 0) {
      const currentTrash = loadTrashList();
      const tIds = new Set(currentTrash.map(t => t.id));
      trashedToIsolate.forEach(t => {
        if (!tIds.has(t.id)) currentTrash.push(t);
      });
      saveTrashList(currentTrash);
    }

    await onDataChanged();
    await updateStats();

    let msg = `取り込み完了\n・カード追加：${cardsToAdd.length}\n・書庫追加：${shelvesToAdd.length}`;
    if (skippedCards > 0 || skippedShelves > 0) {
      msg += `\n・既存ID保護スキップ：カード ${skippedCards} ／ 書庫 ${skippedShelves}`;
    }
    alert(msg);
  }

  DOM.btnImportFile.addEventListener('click', () => {
    DOM.inputImportFile.value = '';
    DOM.inputImportFile.click();
  });

  DOM.inputImportFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    await importBackupJson(text);
  });

  DOM.btnImportText.addEventListener('click', async () => {
    const raw = DOM.inputImportText.value.trim();
    if (!raw) {
      alert('テキストが入力されていません。');
      return;
    }
    await importBackupJson(raw);
    DOM.inputImportText.value = '';
  });

  // --- テキスト取り込み（差分：1行空きで別カード・ミリ秒ズラし一意ID・既存本文スキップ） ---
  DOM.btnBulkImport.addEventListener('click', async () => {
    const raw = DOM.inputBulkText.value;
    if (!raw.trim()) {
      alert('取り込むテキストを入力してください。');
      return;
    }

    const blocks = raw
      .split(/\r?\n\s*\r?\n/)
      .map(b => b.trim())
      .filter(Boolean);

    if (blocks.length === 0) {
      alert('取り込めるテキストがありませんでした。');
      return;
    }

    const existingCards = await loadAllCards();
    const existingIds = new Set(existingCards.map(c => c.id));
    const existingContents = new Set(existingCards.map(c => (c.content || '').trim()));

    const tags = normalizeTags(DOM.inputBulkTags ? DOM.inputBulkTags.value : '');
    let idCursor = Date.now();
    const newCards = [];
    let skipped = 0;

    blocks.forEach(content => {
      if (existingContents.has(content)) {
        skipped++;
        return;
      }
      existingContents.add(content);
      while (existingIds.has(idCursor)) idCursor++;
      existingIds.add(idCursor);
      newCards.push({
        id: idCursor,
        content,
        memo: '',
        tags: [...tags],
        lastupdated: idCursor
      });
      idCursor++;
    });

    if (newCards.length === 0) {
      alert(`すべて既存の本文と一致したためスキップしました (${skipped})。`);
      return;
    }

    await bulkSaveCards(newCards);
    DOM.inputBulkText.value = '';
    if (DOM.inputBulkTags) DOM.inputBulkTags.value = '';

    await onDataChanged();
    await updateStats();
    const skipNote = skipped > 0 ? `（既存一致スキップ ${skipped}）` : '';
    alert(`テキストを取り込みました：追加 ${newCards.length}${skipNote}`);
  });

  // --- 重複整理（古いIDを残し新しい方をローカルゴミ箱へ） ---
  DOM.btnDedupeCards.addEventListener('click', async () => {
    const allCards = await loadAllCards();
    allCards.sort((a, b) => a.id - b.id);

    const seen = new Map();
    const duplicates = [];
    const idMap = new Map();

    allCards.forEach(card => {
      const sortedTags = Array.isArray(card.tags) ? [...card.tags].sort().join(',') : '';
      const key = `${card.content}::${sortedTags}::${card.memo || ''}`;
      if (seen.has(key)) {
        duplicates.push(card);
        idMap.set(card.id, seen.get(key));
      } else {
        seen.set(key, card.id);
      }
    });

    if (duplicates.length === 0) {
      alert('重複カードはありませんでした。');
      return;
    }

    if (!confirm(`完全一致する重複が ${duplicates.length} 見つかりました。\n古いIDを残し、新しい方だけをゴミ箱へ移しますか？`)) {
      return;
    }

    await moveCardsToTrash(duplicates);

    const allShelves = await loadAllShelves();
    const now = Date.now();
    const updatedShelves = [];
    allShelves.forEach(shelf => {
      if (!Array.isArray(shelf.items)) return;
      let changed = false;
      const nextItems = shelf.items.map(item => {
        if (item && idMap.has(item.id)) {
          changed = true;
          return { ...item, id: idMap.get(item.id) };
        }
        return item;
      });
      if (changed) {
        updatedShelves.push({ ...shelf, items: nextItems, lastupdated: now });
      }
    });
    if (updatedShelves.length > 0) {
      await bulkSaveShelves(updatedShelves);
    }

    await onCardsDeleted(new Set(duplicates.map(c => c.id)));
    await onDataChanged();
    await updateStats();
    alert(`重複を整理しました (${duplicates.length})。`);
  });

  return {
    migrateLegacyTrash,
    moveCardsToTrash,
    updateStats,
    renderTrashList
  };
}
