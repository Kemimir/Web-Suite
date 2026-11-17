// Teste do background.js em Node, com um chrome.* simulado.  Uso: node teste/background-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..', 'extensao');

const store = {};
const session = {};
const listeners = { message: [], alarm: [], changed: [], removed: [], updated: [], command: [] };
const discarded = [];
let dynamicRules = [];
let badge = null;
const now = Date.now();
const tabsList = [
  { id: 1, url: 'https://active.example/', active: true, lastAccessed: now - 3 * 3600e3 },
  { id: 2, url: 'https://old.example/page', lastAccessed: now - 2 * 3600e3 },
  { id: 3, url: 'https://recent.example/', lastAccessed: now - 5 * 60e3 },
  { id: 4, url: 'https://pinned.example/', pinned: true, lastAccessed: now - 3 * 3600e3 },
  { id: 5, url: 'https://audio.example/', audible: true, lastAccessed: now - 3 * 3600e3 },
  { id: 6, url: 'https://docs.google.com/document/d/1', lastAccessed: now - 3 * 3600e3 },
  { id: 7, url: 'https://form.example/', lastAccessed: now - 3 * 3600e3 },
  { id: 8, url: 'https://mine.example/', lastAccessed: now - 3 * 3600e3 },
  { id: 9, url: 'chrome://settings/', lastAccessed: now - 3 * 3600e3 },
  { id: 10, url: 'https://done.example/', discarded: true, lastAccessed: now - 3 * 3600e3 },
];
const pick = (src, keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in src).map(k => [k, src[k]]));

const chrome = {
  storage: {
    local: { get: async k => pick(store, k), set: async o => { const ch = {}; for (const [k, v] of Object.entries(o)) { ch[k] = { newValue: v }; store[k] = v; } listeners.changed.forEach(f => f(ch, 'local')); } },
    session: { get: async k => pick(session, k), set: async o => Object.assign(session, o) },
    onChanged: { addListener: f => listeners.changed.push(f) },
  },
  alarms: { create() {}, onAlarm: { addListener: f => listeners.alarm.push(f) } },
  runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener: f => listeners.message.push(f) } },
  tabs: { query: async q => (q && q.active ? [{ id: 99, url: 'https://exemplo.com/a?x=1#h', active: true }] : tabsList), discard: async id => { discarded.push(id); }, onRemoved: { addListener: f => listeners.removed.push(f) }, onUpdated: { addListener: f => listeners.updated.push(f) } },
  commands: { onCommand: { addListener: f => listeners.command.push(f) } },
  declarativeNetRequest: {
    getDynamicRules: async () => dynamicRules,
    updateDynamicRules: async ({ removeRuleIds, addRules }) => { dynamicRules = dynamicRules.filter(r => !removeRuleIds.includes(r.id)).concat(addRules); },
    setExtensionActionOptions: async o => { badge = o.displayActionCountAsBadgeText; },
  },
};

const ctx = { chrome, self: null, console, importScripts: file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx), Promise, Date, URL, Object, Array, Number, Math, Set, setTimeout };
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), ctx);

const send = msg => new Promise(res => listeners.message[0](msg, { tab: { id: 7 } }, res));
const tick = () => new Promise(r => setTimeout(r, 30));
const results = {};

(async () => {
  // 1) aba "suja" (formulário) e estatística
  await send({ type: 'WS_DIRTY' });
  await send({ type: 'WS_STAT', add: { facades: 2, lazyImages: 5, bogus: 'x' } });
  await send({ type: 'WS_STAT', add: { facades: 1 } });
  await tick();
  results.stats = store.ws_stats;

  // 1b) memória por aba: WS_HEAP grava e o fechamento da aba apaga
  await new Promise(res => listeners.message[0]({ type: 'WS_HEAP', used: 123456789, host: 'pesada.example', title: 'Aba pesada' }, { tab: { id: 21 } }, res));
  listeners.message[0]({ type: 'WS_HEAP', used: -5, host: 'x' }, { tab: { id: 22 } }, () => undefined);   // inválido: ignorado, sem resposta
  listeners.message[0]({ type: 'WS_HEAP', used: 7000000, host: 'outra.example' }, { tab: { id: 23 } }, () => undefined);  // simultânea à primeira
  await tick();
  results.heapSaved = Object.keys(session.heaps || {});
  listeners.removed[0](21); await tick();
  results.heapAfterClose = Object.keys(session.heaps || {});

  // 2) suspensão desligada: nada acontece
  await listeners.alarm[0]({ name: 'ws-sweep' }); await tick();
  results.discardedWhenOff = [...discarded];

  // 3) ligada, 30 min, protegendo mine.example
  await chrome.storage.local.set({ ws_tabs: { enabled: true, minutes: 30, protect: ['mine.example'] } });
  await listeners.alarm[0]({ name: 'ws-sweep' }); await tick(); await tick();
  results.discardedWhenOn = [...discarded];
  results.statsAfter = store.ws_stats.discarded;

  // 4) regras de bloqueio por nível
  const level = async (n, extra = {}) => { await chrome.storage.local.set({ ws_config: { blockLevel: n }, ...extra }); await tick(); await tick(); return dynamicRules.map(r => ({ id: r.id, domains: r.condition.requestDomains.length, excluded: r.condition.excludedInitiatorDomains })); };
  results.level0 = await level(0);
  results.level1 = await level(1);
  results.level2 = await level(2, { ws_hosts: { 'meu-site.example': { overrides: { blocker: false } } } });
  results.badge = badge;
  await chrome.storage.local.set({ ws_off: true }); await tick(); await tick();
  results.offRules = dynamicRules.length;
  // 5) atalho: exclui e depois volta a incluir a página atual (sem ?query nem #hash)
  await listeners.command[0]('toggle-page'); await tick();
  results.shortcutOn = JSON.stringify(store.ws_pages);
  await listeners.command[0]('toggle-page'); await tick();
  results.shortcutOff = JSON.stringify(store.ws_pages);
  console.log(JSON.stringify(results, null, 1));
})();
