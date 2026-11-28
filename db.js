// db.js
export const DB_NAME = 'saikiyo2_db';
export const DB_VERSION = 2;
export const STORE_NAME = 'cards';
export const SHELF_STORE_NAME = 'shelves';
export let db;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SHELF_STORE_NAME)) {
        db.createObjectStore(SHELF_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(); };
    request.onerror = (e) => reject(e);
  });
}

// --- カード（原本）操作 ---
export function saveCard(card) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(card);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

export function loadAllCards() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

export function getCard(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

export function bulkSaveCards(cards) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    cards.forEach(card => store.put(card));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

export function deleteCard(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

// --- 書庫（完全スナップショット）操作 ---
export function saveShelf(shelf) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHELF_STORE_NAME, 'readwrite');
    tx.objectStore(SHELF_STORE_NAME).put(shelf);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

export function loadAllShelves() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHELF_STORE_NAME, 'readonly');
    const request = tx.objectStore(SHELF_STORE_NAME).getAll();
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

export function getShelf(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHELF_STORE_NAME, 'readonly');
    const request = tx.objectStore(SHELF_STORE_NAME).get(id);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

export function bulkSaveShelves(shelves) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHELF_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SHELF_STORE_NAME);
    shelves.forEach(shelf => store.put(shelf));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

export function deleteShelf(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHELF_STORE_NAME, 'readwrite');
    tx.objectStore(SHELF_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}
