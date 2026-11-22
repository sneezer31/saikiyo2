/** さいきよ2 - データ管理モジュール（初代完全互換・論理削除・月イチ念押しバックアップ削除） */

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
    inputCleanTag: document.getElementById('input-clean-tag'),
    btnCleanTag: document.getElementById('btn-clean-tag'),
    inputCleanDate: document.getElementById('input-clean-date'),
    btnCleanDate: document.getElementById('btn-clean-date')
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

    // 1. 先にゴミ箱分だけのバックアップを自動保存
    const fileName = makeBackupFileName('saikiyo2_trash_backup');
    downloadTextFile(JSON.stringify(trashPayload, null, 2), fileName);

    // 2. 念押し確認のうえで物理削除
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

  if (DOM.btnEmptyTrash) {
    DOM.btnEmptyTrash.addEventListener('click', emptyTrashWithBackup);
  }

  if (DOM.btnRemindEmpty) {
    DOM.btnRemindEmpty.addEventListener('click', emptyTrashWithBackup);
  }

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

  // --- 一括整理（論理削除：ゴミ箱へ移動） ---
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

  DOM.btnCleanDate.addEventListener('click', async () => {
    const dateVal = DOM.inputCleanDate.value;
    if (!dateVal) {
      alert('基準となる日付を選択してください。');
      return;
    }
    const cutoffTs = new Date(`${dateVal}T00:00:00`).getTime();
    if (Number.isNaN(cutoffTs)) return;

    const allCards = await loadAllCards();
    const targets = allCards.filter(c => !c.deletedAt && c.id < cutoffTs);

    if (targets.length === 0) {
      alert(`${dateVal} より前の通常カードは 0 件です。`);
      return;
    }

    if (!confirm(`${dateVal} より前に作成されたカード ${targets.length} 件をゴミ箱へ移動しますか？\n※ゴミ箱からいつでも元に戻せます。`)) {
      return;
    }

    const now = Date.now();
    const updated = targets.map(c => ({ ...c, deletedAt: now, lastupdated: now }));
    await bulkSaveCards(updated);

    await onCardsDeleted(new Set(targets.map(c => c.id)));
    await updateStats();
    alert(`${targets.length} 件のカードをゴミ箱へ移動しました。`);
  });

  return {
    updateStats,
    checkMonthlyTrashReminder
  };
}
