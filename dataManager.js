/** さいきよ2 - データ管理モジュール（初代完全互換インポート・共有バックアップ・一括削除） */

import {
  loadAllCards,
  bulkSaveCards,
  deleteCard,
  loadAllShelves,
  bulkSaveShelves
} from './db.js';

export function initDataManagerModule({ onDataChanged, onCardsDeleted }) {
  const DOM = {
    stats: document.getElementById('data-stats'),
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
    DOM.stats.textContent = `保存中：カード ${cards.length} 件 ／ リスト棚 ${shelves.length} 件`;
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

  function makeBackupFileName() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    return `saikiyo2_backup_${ymd}_${hm}.txt`;
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

  // 共有シートを立ち上げて .txt ファイルをメール等へ送る
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

  // 通常の .txt ファイル保存
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

  // タグ配列の正規化（初代の status / publish_status もタグへ引き継ぐ）
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

    // 初代『さいきよ』固有フィールドの引き継ぎ
    if (status === 'アーカイブ') addTag('#アーカイブ');
    else if (status === '作品') addTag('#作品');

    if (publishStatus === '既発表') addTag('#既発表');
    else if (publishStatus === '未発表') addTag('#未発表');

    return Array.from(tagSet);
  }

  // 短歌カード正規化（初代・さいきよ2 共通）
  function normalizeCard(raw, fallbackOffset) {
    if (!raw || typeof raw !== 'object') return null;
    const content = typeof raw.content === 'string'
      ? raw.content
      : (typeof raw.text === 'string' ? raw.text : (typeof raw.body === 'string' ? raw.body : null));
    if (content === null) return null;

    const idNum = Number(raw.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : (Date.now() + fallbackOffset);

    return {
      id,
      content,
      memo: typeof raw.memo === 'string' ? raw.memo : '',
      tags: normalizeTags(raw.tags, raw.status, raw.publish_status),
      lastupdated: Number(raw.lastupdated) || id
    };
  }

  // 初代リスト（type === 'list'）をさいきよ2のリスト棚へ変換
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

  // さいきよ2形式のリスト棚を正規化
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
      // 初代『さいきよ』形式（短歌とリストが同じ配列に混在）
      parsed.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        if (entry.type === 'list') rawLegacyLists.push(entry);
        else rawCardItems.push(entry);
      });
    } else if (parsed && typeof parsed === 'object') {
      // さいきよ2形式（または互換オブジェクト形式）
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

    // 1. 短歌カードを変換し、ID解決マップへ登録
    const cardsToImport = rawCardItems
      .map((c, idx) => normalizeCard(c, idx))
      .filter(Boolean);

    cardsToImport.forEach(c => cardLookupMap.set(c.id, c));

    // 2. リスト棚を変換（さいきよ2形式 ＋ 初代リスト変換）
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

    // 3. DBへ一括保存
    if (cardsToImport.length > 0) await bulkSaveCards(cardsToImport);
    if (shelvesToImport.length > 0) await bulkSaveShelves(shelvesToImport);

    // 4. もし以前に初代リストが誤ってカード側へ入っていた場合、重複の残骸を掃除
    const pollutedCardIds = existingCards
      .filter(c => legacyListIds.has(c.id))
      .map(c => c.id);

    if (pollutedCardIds.length > 0) {
      await Promise.all(pollutedCardIds.map(id => deleteCard(id)));
      await onCardsDeleted(new Set(pollutedCardIds));
    }

    await onDataChanged();
    await updateStats();

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

  document.querySelectorAll('.dm-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.inputCleanTag.value = btn.dataset.tag;
    });
  });

  DOM.btnCleanTag.addEventListener('click', async () => {
    const rawTag = DOM.inputCleanTag.value.trim();
    if (!rawTag) {
      alert('削除するタグを入力してください。');
      return;
    }
    const targetTag = rawTag.startsWith('#') ? rawTag : '#' + rawTag;
    const allCards = await loadAllCards();
    const targets = allCards.filter(c => Array.isArray(c.tags) && c.tags.includes(targetTag));

    if (targets.length === 0) {
      alert(`タグ「${targetTag}」が付いたカードは 0 件です。`);
      return;
    }

    if (!confirm(`タグ「${targetTag}」のカード ${targets.length} 件を一括削除しますか？\n※この操作は取り消せません。事前にバックアップを取ることをおすすめします。`)) {
      return;
    }

    const targetIdSet = new Set(targets.map(c => c.id));
    await Promise.all(targets.map(c => deleteCard(c.id)));

    await onCardsDeleted(targetIdSet);
    await updateStats();
    alert(`${targets.length} 件のカードを削除しました。`);
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
    const targets = allCards.filter(c => c.id < cutoffTs);

    if (targets.length === 0) {
      alert(`${dateVal} より前のカードは 0 件です。`);
      return;
    }

    if (!confirm(`${dateVal} より前に作成されたカード ${targets.length} 件を一括削除しますか？\n※この操作は取り消せません。`)) {
      return;
    }

    const targetIdSet = new Set(targets.map(c => c.id));
    await Promise.all(targets.map(c => deleteCard(c.id)));

    await onCardsDeleted(targetIdSet);
    await updateStats();
    alert(`${targets.length} 件のカードを削除しました。`);
  });

  return {
    updateStats
  };
}
