/**
 * Non-extractable key storage.
 * The .p8 is imported as a WebCrypto CryptoKey with extractable=false and
 * stored in IndexedDB. The browser can SIGN with it but physically cannot
 * export the key material — not even our own JavaScript. XSS, extensions,
 * or a localStorage dump get nothing.
 */
"use client";

const DB_NAME = "storeops-keys";
const STORE = "keys";
const KEY_ID = "asc-signing-key";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveKey(key: CryptoKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadKey(): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    const key = await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY_ID);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return key;
  } catch {
    return null;
  }
}

export async function deleteKey(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // best effort
  }
}
