// chrome.* mínimo para abrir o popup numa aba comum: aba atual falsa e estado do script de conteúdo "enlatado".
(() => {
  const listeners = [];
  const store = JSON.parse(localStorage.getItem('popupshim') || '{}');
  const persist = () => localStorage.setItem('popupshim', JSON.stringify(store));
  window.chrome = {
    storage: { local: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in store).map(k => [k, store[k]])),
      set: async obj => { Object.assign(store, obj); persist(); },
    }, onChanged: { addListener: fn => listeners.push(fn) },
    session: { get: async () => ({ heaps: { 11: { used: 310 * 1048576, host: 'pesada.example', title: 'Aba pesada', at: Date.now() }, 12: { used: 90 * 1048576, host: 'leve.example', title: 'Aba leve', at: Date.now() }, 13: { used: 500 * 1048576, host: 'ativa.example', title: 'Aba ativa', at: Date.now() }, 14: { used: 50 * 1048576, host: 'fechada.example', title: 'Fechada', at: Date.now() } } }) } },
    tabs: {
      get: async id => { if (id === 14) throw new Error('sem aba'); return { id, active: id === 13, audible: false, discarded: false }; },
      discard: async id => { (window.__discarded = window.__discarded || []).push(id); },
      reload: id => { (window.__reloaded = window.__reloaded || []).push(id); },
      query: async () => [{ id: 1, url: 'http://localhost:8766/teste/test.html' }],
      sendMessage: async (_id, msg) => {
        const feats = {};
        for (const f of self.WS.FEATURES) feats[f.id] = { allowed: true, enabled: f.def, active: f.def };
        return { key: 'http://localhost:8766/teste/test.html', profile: null, slow: false, globalOff: !!store.ws_off, excluded: false, overrides: {}, features: feats, vitals: { lcp: 2100, fcp: 900, cls: 0.18, inp: null },
          diagnostics: msg.diagnostics ? 'Página: teste\nDNS 0 ms · conexão 1 ms\nRecursos: 3 · transferido 2 KB' : undefined };
      },
    },
  };
})();
