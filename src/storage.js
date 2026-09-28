// localStorage access: keys, sizes, quota errors.


export const P = 'modest-text:v1:';
export const K = {
  index: P + 'index', settings: P + 'settings', closed: P + 'closed', scroll: P + 'scroll',
  lock: P + 'lock', msg: P + 'msg', probe: P + 'probe', tab: (id) => P + 'tab:' + id,
  lastExport: P + 'lastexport', // when Export All last ran (ms since 1970)
};
export const TAB_PREFIX = P + 'tab:';
export const WARN_CHARS = 4194304; // 4 MB
export const PROBE_CHARS = 262144; // 256 KB

// ---------------------------------------------------------------- storage
export function isQuota(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}
export const store = {
  sizes: new Map(),
  get(key) {
    try { return { value: localStorage.getItem(key) }; } catch (error) { return { error }; }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      if (key !== K.probe) this.sizes.set(key, key.length + value.length);
      return { ok: true };
    } catch (error) {
      return { ok: false, quota: isQuota(error), error };
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); this.sizes.delete(key); return true; } catch { return false; }
  },
  ownKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(P)) keys.push(k);
      }
    } catch { /* storage unavailable */ }
    return keys;
  },
  usage() { let u = 0; for (const v of this.sizes.values()) u += v; return u; },
};
