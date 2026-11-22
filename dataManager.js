/** さいきよ2 - データ管理モジュール（初代互換・共有バックアップ・一括取り込み・期間指定・重複整理・月イチゴミ箱削除） */

import {
  loadAllCards,
  bulkSaveCards,
  deleteCard,
  loadAllShelves,
  bulkSaveShelves
} from './db.js';

const TRASH_REMIND_KEY = 'saikiyo2_trash_last_remind';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function initDataManagerModule({ onDataChanged, onCardsDeleted }) {
  const DOM = {
    stats: document.getElementById('data-stats'),
    dmTrashStatus: document.getElementById('dm-trash-status'),
    btnEmptyTrash: document.getElementById('btn-empty-trash'),
    trashRemindBar: document.getElementById('trash-remind-bar'),
    trashRemindText: document.getElementById('trash-remind-text'),
    btnRemindEmpty: document.getElementById('btn-remind-empty'),
    btnRemindLater: document.getElementById('btn-remind-later'),
    btnExportShare: document.getElementById('btn-export-share'),
    btnExportFile: document.getElementById('btn-export-file'),
    btnExportCopy: document.getElementById('btn-export-copy'),
    btnImportFile: document.getElementById('btn-import-file'),
    inputImportFile: document.getElementById('input-import-file'),
    inputImportText: document.getElementById('input-import-text'),
    btnImportText: document.getElementById('btn-import-text'),
    // テキスト一括取り込み
    inputBulkText: document.getElementById('input-bulk-text'),
    inputBulkTags: document.getElementById('input-bulk-tags'),
    btnBulkImport: document.getElementById('btn-bulk-import'),
    // 期間指定
    inputRangeStart: document.getElementById('input-range-start'),
    inputRangeEnd: document.getElementById('input-range-end'),
    btnRangeExport: document.getElementById('btn-range-export'),
    btnRangeTrash: document.getElementById('btn-range-trash'),
    // タグ整理・重複整理
    inputCleanTag: document.getElementById('input-clean-tag'),
    btnCleanTag: document.getElementById('btn-clean-tag'),
    btnDedupeCards: document.getElementById('btn-dedupe-cards')
  };

  async function updateStats() {
    const [cards, shelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
    const activeCount = cards.filter(c => !c.deletedAt).length;
    const trashCount = cards.length - activeCount;

    DOM.stats.textContent = `保存中：カード ${activeCount} 件（ゴミ箱 ${trashCount} 件） ／ リスト棚 ${shelves.length} 件`;

    if (DOM.dmTrashStatus && DOM.btnEmptyTrash) {
      if (trashCount === 0) {
        DOM.dmTrashStatus.textContent = '現在、ゴミ箱は空です。';
        DOM.btnEmptyTrash.disabled = true;
      } else {
        DOM.dmTrashStatus.textContent = `ゴミ箱に ${trashCount} 件のカードがあります。完全削除の前に、ゴミ箱専用のバックアップ（.txt）を自動保存します。`;
        DOM.btnEmptyTrash.disabled = false;
      }
    }
  }

  async function buildBackupPayload() {
    const [cards, shelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
    return {
      app: 'saikiyo2',
      version: 2,
      exportedAt: Date.now(),
      cards,
      shelves
    };
  }

  function makeTimestampStr() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    return `${ymd}_${hm}`;
  }

  function makeBackupFileName(prefix = 'saikiyo2_backup') {
    return `${prefix}_${makeTimestampStr()}.txt`;
  }

  function downloadTextFile(jsonStr, fileName) {
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

  // --- 月イチ念押しチェック ---
  async function checkMonthlyTrashReminder() {
    if (!DOM.trashRemindBar) return;
    const cards = await loadAllCards();
    const trashCards = cards.filter(c => Boolean(c.deletedAt));

    if (trashCards.length === 0) {
      DOM.trashRemindBar.style.display = 'none';
      return;
    }

    const now = Date.now();
    const oldestDeletedAt = Math.min(...trashCards.map(c => Number(c.deletedAt) || now));
    const lastRemind = Number(localStorage.getItem(TRASH_REMIND_KEY)) || 0;

    const hasOldTrash = (now - oldestDeletedAt) >= THIRTY_DAYS_MS;
    const isCooldownPassed = (now - lastRemind) >= THIRTY_DAYS_MS;

    if (hasOldTrash && isCooldownPassed) {
      DOM.trashRemindText.textContent = `ゴミ箱に ${trashCards.length} 件たまっています。月イチの整理として、バックアップファイル（.txt）を作ってから完全に削除しますか？`;
      DOM.trashRemindBar.style.display = 'flex';
    } else {
      DOM.trashRemindBar.style.display = 'none';
    }
  }

  // バックアップを書き出してからゴミ箱を完全削除（念押し付き）
  async function emptyTrashWithBackup() {
    const cards = await loadAllCards();
    const trashCards = cards.filter(c => Boolean(c.deletedAt));

    if (trashCards.length === 0) {
      alert('ゴミ箱は空です。');
      return;
    }

    const trashPayload = {
      app: 'saikiyo2',
      version: 2,
      type: 'trash_archive',
      exportedAt: Date.now(),
      cards: trashCards,
      shelves: []
    };

    const fileName = makeBackupFileName('saikiyo2_trash_backup');
    downloadTextFile(JSON.stringify(trashPayload, null, 2), fileName);

    if (!confirm(`ゴミ箱の ${trashCards.length} 件をバックアップファイル（${fileName}）に保存しました。\n\nこのままゴミ箱から完全に削除しますか？（この操作は取り消せません）`)) {
      return;
    }

    const deletedIdSet = new Set(trashCards.map(c => c.id));
    await Promise.all(trashCards.map(c => deleteCard(c.id)));

    localStorage.setItem(TRASH_REMIND_KEY, String(Date.now()));
    if (DOM.trashRemindBar) DOM.trashRemindBar.style.display = 'none';

    await onCardsDeleted(deletedIdSet);
    await updateStats();
    alert(`ゴミ箱の ${trashCards.length} 件を完全に削除しました。`);
  }

  if (DOM.btnEmptyTrash) DOM.btnEmptyTrash.addEventListener('click', emptyTrashWithBackup);
  if (DOM.btnRemindEmpty) DOM.btnRemindEmpty.addEventListener('click', emptyTrashWithBackup);
  if (DOM.btnRemindLater) {
    DOM.btnRemindLater.addEventListener('click', () => {
      localStorage.setItem(TRASH_REMIND_KEY, String(Date.now()));
      DOM.trashRemindBar.style.display = 'none';
    });
  }

  // --- 共有・ファイル保存・コピー ---
  if (DOM.btnExportShare) {
    DOM.btnExportShare.addEventListener('click', async () => {
      const payload = await buildBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const fileName = makeBackupFileName();
      const file = new File([jsonStr], fileName, { type: 'text/plain' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `さいきよ2 バックアップ (${fileName})`,
            text: `カード ${payload.cards.length} 件 ／ リスト棚 ${payload.shelves.length} 件`
          });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }

      downloadTextFile(jsonStr, fileName);
      alert('この端末では直接共有に非対応のため、.txt ファイルとして保存しました。');
    });
  }

  DOM.btnExportFile.addEventListener('click', async () => {
    const payload = await buildBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);
    downloadTextFile(jsonStr, makeBackupFileName());
  });

  DOM.btnExportCopy.addEventListener('click', async () => {
    const payload = await buildBackupPayload();
    const jsonStr = JSON.stringify(payload);
    try {
      await navigator.clipboard.writeText(jsonStr);
      alert(`バックアップ用データ（カード${payload.cards.length}件・棚${payload.shelves.length}件）をコピーしました。`);
    } catch (_) {
      alert('コピーに失敗しました。');
    }
  });

  // --- 正規化＆初代互換インポート ---
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

    if (status === 'アーカイブ') addTag('#アーカイブ');
    else if (status === '作品') addTag('#作品');

    if (publishStatus === '既発表') addTag('#既発表');
    else if (publishStatus === '未発表') addTag('#未発表');

    return Array.from(tagSet);
  }

  function normalizeCard(raw, fallbackOffset) {
    if (!raw || typeof raw !== 'object') return null;
    const content = typeof raw.content === 'string'
      ? raw.content
      : (typeof raw.text === 'string' ? raw.text : (typeof raw.body === 'string' ? raw.body : null));
    if (content === null) return null;

    const idNum = Number(raw.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : (Date.now() + fallbackOffset);
    const deletedAtNum = raw.deletedAt ? Number(raw.deletedAt) : null;

    return {
      id,
      content,
      memo: typeof raw.memo === 'string' ? raw.memo : '',
      tags: normalizeTags(raw.tags, raw.status, raw.publish_status),
      lastupdated: Number(raw.lastupdated) || id,
      deletedAt: (deletedAtNum && !Number.isNaN(deletedAtNum)) ? deletedAtNum : null
    };
  }

  function convertLegacyListToShelf(rawList, cardLookupMap, fallbackOffset) {
    const idNum = Number(rawList.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : (Date.now() + fallbackOffset);
    const title = (typeof rawList.content === 'string' && rawList.content.trim())
      ? rawList.content.trim()
      : '無題のリスト';

    const rawItemIds = Array.isArray(rawList.items) ? rawList.items : [];
    const items = [];
    let missingCount = 0;

    rawItemIds.forEach(itemRef => {
      if (itemRef && typeof itemRef === 'object' && typeof itemRef.content === 'string') {
        items.push(normalizeCard(itemRef, 0));
        return;
      }
      const refId = Number(itemRef);
      const found = cardLookupMap.get(refId);
      if (found) {
        items.push({
          id: found.id,
          content: found.content,
          memo: found.memo || '',
          tags: Array.isArray(found.tags) ? [...found.tags] : [],
          lastupdated: found.lastupdated || found.id
        });
      } else {
        missingCount++;
      }
    });

    const shelf = {
      id,
      title,
      memo: typeof rawList.memo === 'string' ? rawList.memo : '',
      tags: normalizeTags(rawList.tags, rawList.status, rawList.publish_status),
      items,
      order: Number(rawList.order) || id,
      lastupdated: Number(rawList.lastupdated) || id
    };

    return { shelf, missingCount };
  }

  function normalizeV2Shelf(rawShelf, fallbackOffset) {
    if (!rawShelf || typeof rawShelf !== 'object' || !Array.isArray(rawShelf.items)) return null;
    const idNum = Number(rawShelf.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : (Date.now() + fallbackOffset);

    const items = rawShelf.items
      .map((item, idx) => normalizeCard(item, idx))
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

  async function importBackupJson(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch (_) {
      alert('ファイルの中身が正しいJSON形式ではありません。');
      return;
    }

    const existingCards = await loadAllCards();
    const cardLookupMap = new Map(existingCards.map(c => [c.id, c]));

    const rawCardItems = [];
    const rawLegacyLists = [];
    const rawV2Shelves = [];

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

    const cardsToImport = rawCardItems
      .map((c, idx) => normalizeCard(c, idx))
      .filter(Boolean);

    cardsToImport.forEach(c => cardLookupMap.set(c.id, c));

    const shelvesToImport = [];
    let legacyListCount = 0;
    let totalMissingRefs = 0;
    const legacyListIds = new Set();

    rawV2Shelves.forEach((s, idx) => {
      const normalized = normalizeV2Shelf(s, idx);
      if (normalized) shelvesToImport.push(normalized);
    });

    rawLegacyLists.forEach((rawList, idx) => {
      const { shelf, missingCount } = convertLegacyListToShelf(rawList, cardLookupMap, idx);
      shelvesToImport.push(shelf);
      legacyListIds.add(shelf.id);
      legacyListCount++;
      totalMissingRefs += missingCount;
    });

    if (cardsToImport.length === 0 && shelvesToImport.length === 0) {
      alert('読み込めるデータが見つかりませんでした。');
      return;
    }

    if (cardsToImport.length > 0) await bulkSaveCards(cardsToImport);
    if (shelvesToImport.length > 0) await bulkSaveShelves(shelvesToImport);

    const pollutedCardIds = existingCards
      .filter(c => legacyListIds.has(c.id))
      .map(c => c.id);

    if (pollutedCardIds.length > 0) {
      await Promise.all(pollutedCardIds.map(id => deleteCard(id)));
      await onCardsDeleted(new Set(pollutedCardIds));
    }

    await onDataChanged();
    await updateStats();
    await checkMonthlyTrashReminder();

    let summary = `復元が完了しました。\n・カード：${cardsToImport.length} 件\n・リスト棚：${shelvesToImport.length} 件`;
    if (legacyListCount > 0) {
      summary += `（うち初代リストから自動変換：${legacyListCount} 件）`;
    }
    if (totalMissingRefs > 0) {
      summary += `\n※リスト内の元カードIDが見つからなかった項目：${totalMissingRefs} 件`;
    }
    alert(summary);
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
      alert('JSONテキストが入力されていません。');
      return;
    }
    await importBackupJson(raw);
    DOM.inputImportText.value = '';
  });

  // --- 1. テキスト一括取り込み（空行区切り） ---
  if (DOM.btnBulkImport) {
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
        alert('取り込めるテキストが見つかりませんでした。');
        return;
      }

      const tags = normalizeTags(DOM.inputBulkTags ? DOM.inputBulkTags.value : '');
      const baseNow = Date.now();
      const newCards = blocks.map((content, idx) => ({
        id: baseNow + idx,
        content,
        memo: '',
        tags: [...tags],
        lastupdated: baseNow + idx,
        deletedAt: null
      }));

      await bulkSaveCards(newCards);
      DOM.inputBulkText.value = '';
      if (DOM.inputBulkTags) DOM.inputBulkTags.value = '';

      await onDataChanged();
      await updateStats();
      alert(`${newCards.length} 件のカードを一括取り込みしました。`);
    });
  }

  // --- 2. 期間指定の書き出し・整理（分刻み） ---
  async function getCardsInSelectedRange() {
    const startVal = DOM.inputRangeStart ? DOM.inputRangeStart.value : '';
    const endVal = DOM.inputRangeEnd ? DOM.inputRangeEnd.value : '';

    if (!startVal && !endVal) {
      alert('開始または終了の日時を指定してください。');
      return null;
    }

    const startMs = startVal ? new Date(startVal).getTime() : -Infinity;
    const endMs = endVal ? new Date(endVal).getTime() : Infinity;

    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      alert('日時の形式が正しくありません。');
      return null;
    }

    if (startMs > endMs) {
      alert('開始日時は終了日時より前に設定してください。');
      return null;
    }

    const allCards = await loadAllCards();
    const targets = allCards
      .filter(c => !c.deletedAt && c.id >= startMs && c.id <= endMs)
      .sort((a, b) => a.id - b.id);

    if (targets.length === 0) {
      alert('指定期間内に該当する通常カードはありません。');
      return null;
    }

    return targets;
  }

  if (DOM.btnRangeExport) {
    DOM.btnRangeExport.addEventListener('click', async () => {
      const targets = await getCardsInSelectedRange();
      if (!targets) return;

      const payload = {
        app: 'saikiyo2',
        version: 2,
        type: 'range_export',
        exportedAt: Date.now(),
        cards: targets,
        shelves: []
      };

      const fileName = makeBackupFileName('saikiyo2_range');
      downloadTextFile(JSON.stringify(payload, null, 2), fileName);
      alert(`指定期間の ${targets.length} 件を ${fileName} として書き出しました。`);
    });
  }

  if (DOM.btnRangeTrash) {
    DOM.btnRangeTrash.addEventListener('click', async () => {
      const targets = await getCardsInSelectedRange();
      if (!targets) return;

      if (!confirm(`指定期間のカード ${targets.length} 件を書き出したうえで、ゴミ箱へ移動しますか？\n※ゴミ箱からいつでも元に戻せます。`)) {
        return;
      }

      const payload = {
        app: 'saikiyo2',
        version: 2,
        type: 'range_trash_backup',
        exportedAt: Date.now(),
        cards: targets,
        shelves: []
      };
      const fileName = makeBackupFileName('saikiyo2_range_backup');
      downloadTextFile(JSON.stringify(payload, null, 2), fileName);

      const now = Date.now();
      const updated = targets.map(c => ({ ...c, deletedAt: now, lastupdated: now }));
      await bulkSaveCards(updated);

      await onCardsDeleted(new Set(targets.map(c => c.id)));
      await updateStats();
      alert(`${targets.length} 件を ${fileName} に退避し、ゴミ箱へ移動しました。`);
    });
  }

  // --- 3. タグ整理（論理削除）＆ 重複カードの整理 ---
  document.querySelectorAll('.dm-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.inputCleanTag.value = btn.dataset.tag;
    });
  });

  DOM.btnCleanTag.addEventListener('click', async () => {
    const rawTag = DOM.inputCleanTag.value.trim();
    if (!rawTag) {
      alert('対象タグを入力してください。');
      return;
    }
    const targetTag = rawTag.startsWith('#') ? rawTag : '#' + rawTag;
    const allCards = await loadAllCards();
    const targets = allCards.filter(c => !c.deletedAt && Array.isArray(c.tags) && c.tags.includes(targetTag));

    if (targets.length === 0) {
      alert(`タグ「${targetTag}」が付いた通常カードは 0 件です。`);
      return;
    }

    if (!confirm(`タグ「${targetTag}」のカード ${targets.length} 件をゴミ箱へ移動しますか？\n※ゴミ箱からいつでも元に戻せます。`)) {
      return;
    }

    const now = Date.now();
    const updated = targets.map(c => ({ ...c, deletedAt: now, lastupdated: now }));
    await bulkSaveCards(updated);

    await onCardsDeleted(new Set(targets.map(c => c.id)));
    await updateStats();
    alert(`${targets.length} 件のカードをゴミ箱へ移動しました。`);
  });

  if (DOM.btnDedupeCards) {
    DOM.btnDedupeCards.addEventListener('click', async () => {
      const allCards = await loadAllCards();
      const activeCards = allCards
        .filter(c => !c.deletedAt)
        .sort((a, b) => a.id - b.id);

      const seen = new Map();
      const duplicates = [];
      const idMap = new Map();

      activeCards.forEach(card => {
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
        alert('重複するカードはありませんでした。');
        return;
      }

      if (!confirm(`完全一致する重複カードが ${duplicates.length} 件見つかりました。\n古いほうを残し、新しい ${duplicates.length} 件をゴミ箱へ移動しますか？`)) {
        return;
      }

      const now = Date.now();
      const trashedDuplicates = duplicates.map(c => ({ ...c, deletedAt: now, lastupdated: now }));
      await bulkSaveCards(trashedDuplicates);

      // リスト棚内の原本ID参照も古いIDへ修復
      const allShelves = await loadAllShelves();
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

      const shelfNote = updatedShelves.length > 0 ? `（リスト棚 ${updatedShelves.length} 件の参照IDも修復）` : '';
      alert(`重複カード ${duplicates.length} 件をゴミ箱へ移動しました。${shelfNote}`);
    });
  }

  return {
    updateStats,
    checkMonthlyTrashReminder
  };
}
