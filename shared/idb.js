// Offiqa IndexedDB storage powered by Dexie.
// This file also shims chrome.storage.local so all user-created data and
// settings use one extension-owned IndexedDB database.

(() => {
  const root = globalThis;
  if (root.__offiqaIDBInstalled) return;
  root.__offiqaIDBInstalled = true;

  const DB_NAME = 'offiqa_idb';
  const STORE_NAME = 'kv';
  const STORAGE_MESSAGE = 'offiqa:idb-storage';
  const CHANGE_MESSAGE = 'offiqa:idb-storage-changed';
  const MIGRATION_KEY = 'offiqa_idb_chrome_storage_migrated_at';
  const CONTEXT_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const HAS_CHROME_STORAGE = Boolean(root.chrome?.storage?.local);
  const HAS_RUNTIME = Boolean(root.chrome?.runtime?.sendMessage);
  const HAS_DEXIE = typeof root.Dexie === 'function';
  const IS_EXTENSION_CONTEXT = root.location?.protocol === 'chrome-extension:';
  const IS_BACKGROUND_CONTEXT = IS_EXTENSION_CONTEXT && typeof root.document === 'undefined';
  const CAN_USE_IDB = HAS_DEXIE && typeof root.indexedDB !== 'undefined' && IS_EXTENSION_CONTEXT;

  const nativeStorage = HAS_CHROME_STORAGE ? {
    get: root.chrome.storage.local.get.bind(root.chrome.storage.local),
    set: root.chrome.storage.local.set.bind(root.chrome.storage.local),
    remove: root.chrome.storage.local.remove.bind(root.chrome.storage.local),
    clear: root.chrome.storage.local.clear.bind(root.chrome.storage.local)
  } : null;
  const nativeOnChanged = root.chrome?.storage?.onChanged || null;
  const changeListeners = new Set();

  let dbInstance = null;
  let readyPromise = null;

  function cloneValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeKeyList(keys) {
    if (keys == null) return null;
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys;
    if (typeof keys === 'object') return Object.keys(keys);
    return [];
  }

  function withCallback(promise, callback) {
    if (typeof callback === 'function') {
      promise.then((result) => callback(result)).catch((error) => {
        console.error('[OffiqaIDB] storage operation failed:', error);
        callback(undefined);
      });
    }
    return promise;
  }

  function nativeGet(keys) {
    if (!nativeStorage) return Promise.resolve({});
    return new Promise((resolve) => nativeStorage.get(keys, (data) => resolve(data || {})));
  }

  function nativeClear() {
    if (!nativeStorage) return Promise.resolve();
    return new Promise((resolve) => nativeStorage.clear(() => resolve()));
  }

  function nativeRemove(keys) {
    if (!nativeStorage) return Promise.resolve();
    return new Promise((resolve) => nativeStorage.remove(keys, () => resolve()));
  }

  function getDB() {
    if (!CAN_USE_IDB) {
      throw new Error('Dexie IndexedDB storage is not available in this context.');
    }
    if (!dbInstance) {
      dbInstance = new root.Dexie(DB_NAME);
      dbInstance.version(1).stores({ [STORE_NAME]: '&key' });
    }
    return dbInstance;
  }

  async function rawGet(key) {
    const row = await getDB()[STORE_NAME].get(key);
    return row ? cloneValue(row.value) : undefined;
  }

  async function rawPut(key, value) {
    await getDB()[STORE_NAME].put({
      key,
      value: cloneValue(value),
      updatedAt: Date.now()
    });
  }

  async function rawBulkPut(values) {
    const now = Date.now();
    const rows = Object.entries(values).map(([key, value]) => ({
      key,
      value: cloneValue(value),
      updatedAt: now
    }));
    if (rows.length) await getDB()[STORE_NAME].bulkPut(rows);
  }

  async function rawDelete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length) await getDB()[STORE_NAME].bulkDelete(list);
  }

  async function ensureReady() {
    if (!CAN_USE_IDB) return;
    if (!readyPromise) {
      readyPromise = (async () => {
        await getDB().open();
        await migrateChromeStorage();
      })();
    }
    await readyPromise;
  }

  async function migrateChromeStorage() {
    if (!nativeStorage) return;
    const marker = await rawGet(MIGRATION_KEY);
    if (marker) {
      await rescueNativeMemories();
      return;
    }

    const data = await nativeGet(null);
    const entries = Object.entries(data).filter(([key]) => key !== MIGRATION_KEY);
    if (entries.length) {
      await rawBulkPut(Object.fromEntries(entries));
      await nativeClear();
    }
    await rawPut(MIGRATION_KEY, {
      version: 1,
      migratedAt: Date.now(),
      migratedKeys: entries.map(([key]) => key)
    });
  }

  async function rescueNativeMemories() {
    const data = await nativeGet(['memories']);
    const nativeMemories = Array.isArray(data.memories) ? data.memories : [];
    if (!nativeMemories.length) return;

    const currentMemories = await rawGet('memories');
    const existingMemories = Array.isArray(currentMemories) ? currentMemories : [];
    const seen = new Set();
    const merged = [];
    [...nativeMemories, ...existingMemories].forEach((memory) => {
      if (!memory || typeof memory !== 'object') return;
      const signature = memory.id || `${memory.type || ''}|${memory.text || ''}|${memory.created || ''}`;
      if (!signature || seen.has(signature)) return;
      seen.add(signature);
      merged.push(cloneValue(memory));
    });

    if (merged.length) {
      await rawPut('memories', merged);
    }
    await nativeRemove(['memories']);
  }

  async function storageGet(keys) {
    await ensureReady();
    if (keys == null) {
      const rows = await getDB()[STORE_NAME].toArray();
      return Object.fromEntries(
        rows
          .filter((row) => row.key !== MIGRATION_KEY)
          .map((row) => [row.key, cloneValue(row.value)])
      );
    }

    if (typeof keys === 'object' && !Array.isArray(keys)) {
      const result = {};
      await Promise.all(Object.entries(keys).map(async ([key, defaultValue]) => {
        const value = await rawGet(key);
        result[key] = value === undefined ? cloneValue(defaultValue) : value;
      }));
      return result;
    }

    const result = {};
    await Promise.all(normalizeKeyList(keys).map(async (key) => {
      const value = await rawGet(key);
      if (value !== undefined) result[key] = value;
    }));
    return result;
  }

  async function buildSetChanges(values) {
    const changes = {};
    await Promise.all(Object.keys(values).map(async (key) => {
      changes[key] = {
        oldValue: await rawGet(key),
        newValue: cloneValue(values[key])
      };
    }));
    return changes;
  }

  async function storageSet(values = {}) {
    await ensureReady();
    const changes = await buildSetChanges(values);
    await rawBulkPut(values);
    await notifyStorageChanged(changes);
  }

  async function storageRemove(keys) {
    await ensureReady();
    const list = normalizeKeyList(keys) || [];
    const changes = {};
    await Promise.all(list.map(async (key) => {
      const oldValue = await rawGet(key);
      if (oldValue !== undefined) changes[key] = { oldValue, newValue: undefined };
    }));
    await rawDelete(list);
    await notifyStorageChanged(changes);
  }

  async function storageClear() {
    await ensureReady();
    const rows = await getDB()[STORE_NAME].toArray();
    const userRows = rows.filter((row) => row.key !== MIGRATION_KEY);
    const changes = Object.fromEntries(
      userRows.map((row) => [row.key, { oldValue: cloneValue(row.value), newValue: undefined }])
    );
    await rawDelete(userRows.map((row) => row.key));
    await notifyStorageChanged(changes);
  }

  async function get(key) {
    const data = await makeStorageAPI().get([key]);
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
  }

  async function set(key, value) {
    await makeStorageAPI().set({ [key]: value });
  }

  async function remove(key) {
    await makeStorageAPI().remove(key);
  }

  async function exportData() {
    if (!CAN_USE_IDB) return bridgeRequest('export');
    return {
      app: 'Offiqa',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: await storageGet(null)
    };
  }

  async function importData(payload, { mode = 'merge' } = {}) {
    if (!CAN_USE_IDB) {
      await bridgeRequest('import', { data: payload, options: { mode } });
      return;
    }
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid Offiqa import payload.');
    }
    if (mode === 'replace') await storageClear();
    await storageSet(data);
  }

  function emitStorageChanged(changes, areaName = 'local') {
    if (!changes || !Object.keys(changes).length) return;
    changeListeners.forEach((listener) => {
      try {
        listener(changes, areaName);
      } catch (error) {
        console.error('[OffiqaIDB] storage change listener failed:', error);
      }
    });
  }

  function sendToRuntime(message) {
    if (!HAS_RUNTIME) return;
    try {
      root.chrome.runtime.sendMessage(message, () => {
        void root.chrome.runtime.lastError;
      });
    } catch (_) {
      // Some contexts cannot receive runtime messages during shutdown.
    }
  }

  function broadcastStorageChanged(changes) {
    if (!changes || !Object.keys(changes).length) return;
    const message = { type: CHANGE_MESSAGE, changes, sourceContextId: CONTEXT_ID };
    sendToRuntime(message);

    if (root.chrome?.tabs?.query) {
      root.chrome.tabs.query({}, (tabs) => {
        (tabs || []).forEach((tab) => {
          if (!tab?.id) return;
          root.chrome.tabs.sendMessage(tab.id, message, () => {
            void root.chrome.runtime.lastError;
          });
        });
      });
    }
  }

  async function notifyStorageChanged(changes) {
    emitStorageChanged(changes, 'local');
    if (CAN_USE_IDB) {
      broadcastStorageChanged(changes);
    }
  }

  function bridgeRequest(operation, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!HAS_RUNTIME) {
        reject(new Error('chrome.runtime messaging is not available.'));
        return;
      }
      root.chrome.runtime.sendMessage({ type: STORAGE_MESSAGE, operation, payload }, (response) => {
        if (root.chrome.runtime.lastError) {
          reject(new Error(root.chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.reason || 'Offiqa storage request failed.'));
          return;
        }
        resolve(response.result);
      });
    });
  }

  function makeStorageAPI() {
    if (CAN_USE_IDB) {
      return {
        get: storageGet,
        set: storageSet,
        remove: storageRemove,
        clear: storageClear
      };
    }
    return {
      get: (keys) => bridgeRequest('get', { keys }),
      set: (values) => bridgeRequest('set', { values }),
      remove: (keys) => bridgeRequest('remove', { keys }),
      clear: () => bridgeRequest('clear')
    };
  }

  function patchChromeStorage() {
    if (!HAS_CHROME_STORAGE) return;
    const api = makeStorageAPI();
    root.chrome.storage.local.get = (keys, callback) => withCallback(api.get(keys), callback);
    root.chrome.storage.local.set = (values, callback) => withCallback(api.set(values), callback);
    root.chrome.storage.local.remove = (keys, callback) => withCallback(api.remove(keys), callback);
    root.chrome.storage.local.clear = (callback) => withCallback(api.clear(), callback);

    if (nativeOnChanged) {
      nativeOnChanged.addListener = (listener) => changeListeners.add(listener);
      nativeOnChanged.removeListener = (listener) => changeListeners.delete(listener);
      nativeOnChanged.hasListener = (listener) => changeListeners.has(listener);
      nativeOnChanged.hasListeners = () => changeListeners.size > 0;
    }
  }

  function installMessageHandlers() {
    if (!root.chrome?.runtime?.onMessage) return;

    root.chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === CHANGE_MESSAGE) {
        if (message.sourceContextId === CONTEXT_ID) return false;
        emitStorageChanged(message.changes, 'local');
        return false;
      }

      if (message?.type !== STORAGE_MESSAGE || !CAN_USE_IDB || !IS_BACKGROUND_CONTEXT) return false;

      (async () => {
        const { operation, payload = {} } = message;
        if (operation === 'get') return storageGet(payload.keys);
        if (operation === 'set') return storageSet(payload.values || {});
        if (operation === 'remove') return storageRemove(payload.keys);
        if (operation === 'clear') return storageClear();
        if (operation === 'export') return exportData();
        if (operation === 'import') return importData(payload.data, payload.options || {});
        throw new Error(`Unknown Offiqa storage operation: ${operation}`);
      })()
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, reason: error?.message || String(error) }));

      return true;
    });
  }

  patchChromeStorage();
  installMessageHandlers();

  root.OffiqaIDB = {
    get,
    set,
    remove,
    clear: () => makeStorageAPI().clear(),
    getAll: () => makeStorageAPI().get(null),
    exportData,
    importData,
    ready: () => (CAN_USE_IDB ? ensureReady() : Promise.resolve())
  };
})();
