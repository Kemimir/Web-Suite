// Simula só o pedaço do chrome.* que a extensão usa, para testar numa página comum.
(() => {
  const listeners = [];
  const store = JSON.parse(localStorage.getItem('chromeshim') || '{}');
  const persist = () => localStorage.setItem('chromeshim', JSON.stringify(store));
  const pick = keys => {
    const list = Array.isArray(keys) ? keys : keys == null ? Object.keys(store) : [keys];
    return Object.fromEntries(list.filter(k => k in store).map(k => [k, store[k]]));
  };
  window.chrome = {
    storage: {
      local: {
        get: async keys => pick(keys),
        set: async obj => {
          const changes = {};
          for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; }
          persist();
          listeners.forEach(fn => fn(changes, 'local'));
        },
        clear: async () => { for (const k of Object.keys(store)) delete store[k]; persist(); },
      },
      onChanged: { addListener: fn => listeners.push(fn) },
    },
    runtime: { onMessage: { addListener: fn => { window.__wsMsg = fn; } }, sendMessage: async m => { (window.__sent = window.__sent || []).push(m); return true; } },
  };
  if (location.search.includes('slow')) {
    const c = new EventTarget();
    Object.assign(c, { effectiveType: '3g', saveData: false, downlink: 1.2, rtt: 400 });
    Object.defineProperty(navigator, 'connection', { value: c });
  }
})();
