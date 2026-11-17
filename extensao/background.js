/*
 * WEBoa — serviço em segundo plano.
 *  1. Suspende abas inativas (chrome.tabs.discard), com proteções.
 *  2. Controla scripts de terceiros por categoria (declarativeNetRequest).
 *  3. Soma as estatísticas de economia enviadas pelo script de conteúdo.
 */
importScripts('shared/features.js');

const { BLOCK_CATEGORIES, PROTECTED_APPS, matchesHost, pageKeyOf, profileFor } = self.WS;

const KEYS = {
    off: 'ws_off',
    hosts: 'ws_hosts',
    config: 'ws_config',
    pages: 'ws_pages',
    tabs: 'ws_tabs',
    stats: 'ws_stats',
};

const DEFAULT_TABS = { enabled: false, minutes: 30, protect: [] };

/* ---------------------------------------------------------------------- *
 *  Estatísticas
 * ---------------------------------------------------------------------- */
let statsQueue = Promise.resolve();

function addStats(add) {
    statsQueue = statsQueue.then(async () => {
        const { [KEYS.stats]: current } = await chrome.storage.local.get(KEYS.stats);
        const next = { since: Date.now(), ...(current || {}) };
        for (const [name, value] of Object.entries(add || {})) {
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) next[name] = (next[name] || 0) + Math.min(value, 1000);
        }
        await chrome.storage.local.set({ [KEYS.stats]: next });
    }).catch(() => undefined);
    return statsQueue;
}

/* ---------------------------------------------------------------------- *
 *  Scripts de terceiros (níveis 0, 1 e 2)
 * ---------------------------------------------------------------------- */
const RULE_TYPES = ['script', 'xmlhttprequest', 'ping', 'sub_frame', 'image'];

async function syncBlockRules() {
    const values = await chrome.storage.local.get([KEYS.off, KEYS.hosts, KEYS.config]);
    const level = Math.max(0, Math.min(2, Number(values[KEYS.config]?.blockLevel) || 0));
    const off = values[KEYS.off] === true;

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map(rule => rule.id);

    const addRules = [];
    if (!off && level > 0) {
        // Sites onde o usuário desligou a função "blocker" ficam de fora, e a Crunchyroll sempre.
        const hosts = values[KEYS.hosts] && typeof values[KEYS.hosts] === 'object' ? values[KEYS.hosts] : {};
        const excluded = ['crunchyroll.com', ...Object.entries(hosts).filter(([, v]) => v?.overrides?.blocker === false).map(([h]) => h)];
        const groups = [['social', 1], ['analytics', 1], ['embeds', 2]];
        let id = 1;
        for (const [name, minLevel] of groups) {
            if (level < minLevel) continue;
            addRules.push({
                id: id++,
                priority: 1,
                action: { type: 'block' },
                condition: {
                    requestDomains: BLOCK_CATEGORIES[name],
                    domainType: 'thirdParty',
                    resourceTypes: RULE_TYPES,
                    excludedInitiatorDomains: excluded,
                },
            });
        }
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    // O número de requisições bloqueadas na aba aparece no ícone.
    await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: level > 0 && !off });
}

/* ---------------------------------------------------------------------- *
 *  Suspensão de abas
 * ---------------------------------------------------------------------- */
async function dirtyTabs() {
    const { dirty } = await chrome.storage.session.get('dirty');
    return new Set(Array.isArray(dirty) ? dirty : []);
}

let dirtyQueue = Promise.resolve();

function markDirty(tabId, value) {
    dirtyQueue = dirtyQueue.then(async () => {
        const set = await dirtyTabs();
        if (value) set.add(tabId);
        else set.delete(tabId);
        await chrome.storage.session.set({ dirty: [...set] });
    }).catch(() => undefined);
    return dirtyQueue;
}

async function sweep() {
    const values = await chrome.storage.local.get([KEYS.off, KEYS.tabs]);
    const settings = { ...DEFAULT_TABS, ...(values[KEYS.tabs] || {}) };
    if (values[KEYS.off] === true || !settings.enabled) return;

    const idleMs = Math.max(5, Number(settings.minutes) || 30) * 60 * 1000;
    const protect = [...PROTECTED_APPS, ...(Array.isArray(settings.protect) ? settings.protect : [])];
    const dirty = await dirtyTabs();
    const now = Date.now();
    let count = 0;

    for (const tab of await chrome.tabs.query({})) {
        if (tab.active || tab.pinned || tab.audible || tab.discarded || tab.autoDiscardable === false) continue;
        if (!tab.url || !/^https?:/.test(tab.url) || dirty.has(tab.id)) continue;
        if (typeof tab.lastAccessed !== 'number' || now - tab.lastAccessed < idleMs) continue;

        let host = '';
        try {
            host = new URL(tab.url).hostname;
        } catch {
            continue;
        }
        if (matchesHost(host, protect)) continue;

        try {
            await chrome.tabs.discard(tab.id);
            count += 1;
        } catch {
            // aba já fechada ou protegida pelo navegador
        }
    }

    if (count) await addStats({ discarded: count });
}

/* ---------------------------------------------------------------------- *
 *  Eventos
 * ---------------------------------------------------------------------- */
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('ws-sweep', { periodInMinutes: 1 });
    syncBlockRules();
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create('ws-sweep', { periodInMinutes: 1 });
    syncBlockRules();
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'ws-sweep') sweep();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[KEYS.config] || changes[KEYS.hosts] || changes[KEYS.off])) syncBlockRules();
});

// Leitura-modificação-escrita em fila: várias abas avisam ao mesmo tempo e uma não pode apagar a outra.
let heapQueue = Promise.resolve();

function saveHeap(tabId, data) {
    heapQueue = heapQueue.then(async () => {
        const { heaps } = await chrome.storage.session.get('heaps');
        const next = { ...(heaps || {}) };
        if (data) next[tabId] = data;
        else delete next[tabId];
        await chrome.storage.session.set({ heaps: next });
    }).catch(() => undefined);
    return heapQueue;
}

// Atalho (Alt+Shift+W): exclui ou volta a incluir a página atual.
let pagesQueue = Promise.resolve();

function togglePage(url) {
    const key = pageKeyOf(url || '');
    if (!/^https?:/.test(key)) return pagesQueue;
    pagesQueue = pagesQueue.then(async () => {
        const { [KEYS.pages]: pages } = await chrome.storage.local.get(KEYS.pages);
        const next = { ...(pages && typeof pages === 'object' ? pages : {}) };
        const entry = next[key] || { excluded: false, overrides: {} };
        if (entry.excluded) {
            if (Object.keys(entry.overrides || {}).length) next[key] = { excluded: false, overrides: entry.overrides };
            else delete next[key];
        } else {
            next[key] = { excluded: true, overrides: entry.overrides || {} };
        }
        await chrome.storage.local.set({ [KEYS.pages]: next });
    }).catch(() => undefined);
    return pagesQueue;
}

chrome.commands?.onCommand.addListener(async command => {
    if (command !== 'toggle-page') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && !profileFor(new URL(tab.url).hostname)) await togglePage(tab.url);
});

chrome.tabs.onRemoved.addListener(tabId => {
    markDirty(tabId, false);
    saveHeap(tabId, null);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading' && change.url) markDirty(tabId, false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'WS_STAT') {
        addStats(message.add);
        sendResponse(true);
        return false;
    }
    if (message?.type === 'WS_HEAP' && sender.tab?.id !== undefined && Number.isFinite(message.used) && message.used >= 0) {
        saveHeap(sender.tab.id, { used: message.used, host: String(message.host || '').slice(0, 80), title: String(message.title || '').slice(0, 80), at: Date.now() });
        sendResponse(true);
        return false;
    }
    if (message?.type === 'WS_DIRTY' && sender.tab?.id !== undefined) {
        markDirty(sender.tab.id, true);
        sendResponse(true);
        return false;
    }
    return false;
});
