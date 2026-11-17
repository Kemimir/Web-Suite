(() => {
    'use strict';

    const { FEATURES, PAGE_THEMES, PANEL_THEMES, THEME_PARTS, themePartsOf, pageKeyOf, profileFor } = self.WS;
    const STORE = { defaults: 'ws_defaults', pages: 'ws_pages', hosts: 'ws_hosts', config: 'ws_config', off: 'ws_off', tabs: 'ws_tabs', stats: 'ws_stats' };
    const $ = id => document.getElementById(id);

    let tab = null;
    let cat = 'Conexão';              // tipo de função mostrado nas listas
    let key = '';
    let host = '';
    let state = null;                // resposta do script de conteúdo (null = página sem a extensão)
    let store = { defaults: {}, pages: {}, hosts: {}, config: { blockedHosts: [], allowedPopupHosts: [], blockLevel: 0 }, tabs: { enabled: false, minutes: 30, protect: [] }, stats: {}, off: false };

    /* ------------------------------ armazenamento ------------------------------ */
    async function loadStore() {
        const v = await chrome.storage.local.get(Object.values(STORE));
        store = {
            defaults: v[STORE.defaults] && typeof v[STORE.defaults] === 'object' ? v[STORE.defaults] : {},
            pages: v[STORE.pages] && typeof v[STORE.pages] === 'object' ? v[STORE.pages] : {},
            hosts: v[STORE.hosts] && typeof v[STORE.hosts] === 'object' ? v[STORE.hosts] : {},
            config: { blockedHosts: [], allowedPopupHosts: [], blockLevel: 0, ...(v[STORE.config] || {}) },
            tabs: { enabled: false, minutes: 30, protect: [], ...(v[STORE.tabs] || {}) },
            stats: v[STORE.stats] && typeof v[STORE.stats] === 'object' ? v[STORE.stats] : {},
            off: v[STORE.off] === true,
        };
        document.documentElement.dataset.theme = PANEL_THEMES[store.config.theme] ? store.config.theme : 'orange';
    }

    /* ------------------------------ temas e backup ------------------------------ */
    function fillSelect(select, entries, value) {
        select.replaceChildren();
        for (const [id, name] of entries) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            select.append(option);
        }
        select.value = value;
    }

    // Aceita só o que a extensão grava; o resto é descartado.
    function sanitizeBackup(raw) {
        if (!raw || raw.app !== 'weboa' || !raw.data || typeof raw.data !== 'object') throw new Error('Arquivo inválido.');
        const known = new Set(FEATURES.map(f => f.id));
        const plain = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
        const bools = obj => Object.fromEntries(Object.entries(plain(obj)).filter(([k, v]) => (known.has(k) || k === 'blocker') && typeof v === 'boolean'));
        const list = x => (Array.isArray(x) ? x.map(String).map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 500) : []);
        const d = raw.data;

        const pages = {};
        for (const [k, v] of Object.entries(plain(d.pages)).slice(0, 2000)) {
            pages[k] = { excluded: plain(v).excluded === true, overrides: bools(plain(v).overrides) };
        }
        const hosts = {};
        for (const [k, v] of Object.entries(plain(d.hosts)).slice(0, 2000)) {
            hosts[k] = { overrides: bools(plain(v).overrides) };
        }
        const c = plain(d.config);
        const t = plain(d.tabs);
        return {
            [STORE.defaults]: bools(d.defaults),
            [STORE.pages]: pages,
            [STORE.hosts]: hosts,
            [STORE.config]: {
                blockedHosts: list(c.blockedHosts),
                allowedPopupHosts: list(c.allowedPopupHosts),
                blockLevel: [0, 1, 2].includes(Number(c.blockLevel)) ? Number(c.blockLevel) : 0,
                theme: PANEL_THEMES[c.theme] ? c.theme : 'orange',
                pageTheme: PAGE_THEMES[c.pageTheme] ? c.pageTheme : 'dark',
                themeParts: themePartsOf(c.themeParts),
            },
            [STORE.tabs]: { enabled: t.enabled === true, minutes: [10, 30, 60, 180].includes(Number(t.minutes)) ? Number(t.minutes) : 30, protect: list(t.protect) },
        };
    }

    async function exportConfig() {
        const body = JSON.stringify({
            app: 'weboa',
            version: 1,
            exportedAt: new Date().toISOString(),
            data: { defaults: store.defaults, pages: store.pages, hosts: store.hosts, config: store.config, tabs: store.tabs },
        }, null, 2);
        const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'weboa-config.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        $('cfgMsg').textContent = 'Configurações exportadas.';
    }

    async function importConfig(file) {
        try {
            const next = sanitizeBackup(JSON.parse(await file.text()));
            await chrome.storage.local.set(next);
            await loadStore();
            renderDefaults();
            await refreshState();
            $('cfgMsg').textContent = 'Configurações importadas.';
        } catch (error) {
            $('cfgMsg').textContent = 'Não foi possível importar: ' + (error?.message || 'arquivo inválido') ;
        }
    }

    const save = patch => chrome.storage.local.set(patch);
    const defaultOf = f => (typeof store.defaults[f.id] === 'boolean' ? store.defaults[f.id] : f.def);
    const pageEntry = () => store.pages[key] || { excluded: false, overrides: {} };

    async function writePage(entry) {
        const pages = { ...store.pages };
        const empty = !entry.excluded && !Object.keys(entry.overrides || {}).length;
        if (empty) delete pages[key];
        else pages[key] = entry;
        store.pages = pages;
        await save({ [STORE.pages]: pages });
    }

    async function writeHost(overrides) {
        const hosts = { ...store.hosts };
        if (Object.keys(overrides).length) hosts[host] = { overrides };
        else delete hosts[host];
        store.hosts = hosts;
        await save({ [STORE.hosts]: hosts });
    }

    const hostOverrides = () => (store.hosts[host]?.overrides && typeof store.hosts[host].overrides === 'object' ? store.hosts[host].overrides : {});

    /* ------------------------------ componentes ------------------------------ */
    function makeSwitch(checked, onChange, label, disabled = false) {
        const el = document.createElement('div');
        el.className = 'switch';
        el.setAttribute('role', 'switch');
        el.setAttribute('aria-checked', String(checked));
        el.setAttribute('aria-label', label);
        el.tabIndex = disabled ? -1 : 0;
        if (disabled) el.setAttribute('aria-disabled', 'true');

        const flip = () => {
            if (disabled) return;
            const next = el.getAttribute('aria-checked') !== 'true';
            el.setAttribute('aria-checked', String(next));
            onChange(next);
        };
        el.addEventListener('click', flip);
        el.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                flip();
            }
        });
        return el;
    }

    function featureRow(f, checked, onChange, { disabled = false, note = '' } = {}) {
        const row = document.createElement('div');
        row.className = 'row' + (disabled ? ' off' : '');
        const text = document.createElement('div');
        text.className = 'grow';
        const h = document.createElement('h3');
        h.textContent = f.name;
        const p = document.createElement('p');
        p.textContent = note || f.desc;
        text.append(h, p);
        row.append(text, makeSwitch(checked, onChange, f.name, disabled));
        return row;
    }

    const GROUPS = [...new Set(FEATURES.map(f => f.group))];
    const CATS_PAGE = GROUPS;
    const CATS_DEFAULTS = [...GROUPS, 'Temas', 'Backup'];

    // Mostra só as funções do tipo escolhido.
    const viewOf = cats => (cats.includes(cat) ? cat : cats[0]);

    function groupedList(container, build) {
        const view = viewOf(container.id === 'pageFeatures' ? CATS_PAGE : CATS_DEFAULTS);
        container.replaceChildren();
        for (const f of FEATURES) if (f.group === view) container.append(build(f));
    }

    function renderCats(container, cats) {
        const view = viewOf(cats);
        container.replaceChildren();
        for (const name of cats) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cat';
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(name === view));
            b.textContent = name;
            b.addEventListener('click', () => {
                cat = name;
                renderPage();
                renderDefaults();
            });
            container.append(b);
        }
    }

    /* ------------------------------ abas ------------------------------ */
    function renderPage() {
        const supported = !!key;
        $('excludeToggle').parentElement.hidden = !supported;
        $('resetPage').hidden = !supported;
        $('safeMode').hidden = !supported;
        const note = $('pageNote');

        if (!supported) {
            note.hidden = false;
            note.textContent = 'Esta aba não é uma página http(s): a extensão não atua aqui.';
            $('pageFeatures').replaceChildren();
            return;
        }

        const entry = pageEntry();
        const prof = profileFor(host);
        note.hidden = !prof && !!state;
        note.textContent = prof
            ? prof.note + ': aqui só ficam as funções que não tocam na página (as demais estão indisponíveis).'
            : state ? '' : 'A extensão ainda não está ativa nesta aba. Recarregue a página para aplicar.';

        $('excludeToggle').setAttribute('aria-checked', String(entry.excluded === true));
        renderBlock(prof);
        renderQuick();

        renderCats($('catsPage'), CATS_PAGE);
        groupedList($('pageFeatures'), f => {
            const blocked = prof && !prof.only.includes(f.id);
            const checked = blocked ? false : (state?.features?.[f.id]?.enabled ?? (typeof entry.overrides?.[f.id] === 'boolean' ? entry.overrides[f.id] : defaultOf(f)));
            return featureRow(f, checked, async value => {
                const next = { excluded: pageEntry().excluded, overrides: { ...pageEntry().overrides } };
                if (value === defaultOf(f)) delete next.overrides[f.id];
                else next.overrides[f.id] = value;
                await writePage(next);
                await refreshState();
            }, { disabled: blocked || entry.excluded, note: blocked ? 'Indisponível neste site.' : '' });
        });
    }

    // "Excluir de uma função só": a página ou o site inteiro, uma função de cada vez.
    function renderQuick() {
        const prof = profileFor(host);
        const select = $('quickFeature');
        const chosen = select.value;
        select.replaceChildren();
        for (const f of FEATURES) {
            if (prof && !prof.only.includes(f.id)) continue;
            const option = document.createElement('option');
            option.value = f.id;
            option.textContent = f.name;
            select.append(option);
        }
        if (chosen) select.value = chosen;

        const list = $('quickList');
        list.replaceChildren();
        const chip = (scope, f, remove) => {
            const el = document.createElement('span');
            el.className = 'chip';
            el.innerHTML = '<b></b><span></span>';
            el.querySelector('b').textContent = scope;
            el.querySelector('span').textContent = f.name;
            const x = document.createElement('button');
            x.type = 'button';
            x.textContent = '×';
            x.title = 'Remover esta exclusão';
            x.setAttribute('aria-label', 'Remover exclusão: ' + f.name);
            x.addEventListener('click', remove);
            el.append(x);
            list.append(el);
        };
        const page = pageEntry().overrides || {};
        const site = hostOverrides();
        for (const f of FEATURES) {
            if (page[f.id] === false) {
                chip('Página', f, async () => {
                    const next = { excluded: pageEntry().excluded, overrides: { ...pageEntry().overrides } };
                    delete next.overrides[f.id];
                    await writePage(next);
                    await refreshState();
                });
            }
            if (site[f.id] === false) {
                chip('Site', f, async () => {
                    const next = { ...hostOverrides() };
                    delete next[f.id];
                    await writeHost(next);
                    await refreshState();
                });
            }
        }
        const supported = !!key;
        $('quickPage').disabled = !supported;
        $('quickSite').disabled = !supported;
    }

    const LEVEL_NAMES = ['desligado', 'rastreadores e botões sociais', 'rastreadores, chats e testes A/B'];

    function renderBlock(prof) {
        const row = $('blockRow');
        row.hidden = !key || !!prof;
        if (row.hidden) return;
        const level = Number(store.config.blockLevel) || 0;
        const siteOff = hostOverrides().blocker === false;
        $('blockToggle').setAttribute('aria-checked', String(!siteOff && level > 0));
        $('blockNote').textContent = level === 0
            ? 'Bloqueio desligado nos Padrões (engrenagem → Padrões → Scripts de terceiros).'
            : `Nível atual: ${LEVEL_NAMES[level]}. Vale pelo site inteiro.`;
    }

    function renderStats() {
        const s = store.stats || {};
        const n = name => Number(s[name]) || 0;
        const mb = (n('facades') * 0.5).toFixed(1);
        $('statsText').textContent = [
            `Vídeos adiados (fachadas): ${n('facades')}  (≈ ${mb} MB poupados, estimativa)`,
            `Imagens adiadas: ${n('lazyImages')}`,
            `Iframes adiados: ${n('lazyIframes')}`,
            `Páginas pré-carregadas: ${n('prefetched')}`,
            `Conexões preparadas: ${n('preconnected')}`,
            `Abas suspensas: ${n('discarded')}`,
            `Vídeos que começavam sozinhos, pausados: ${n('autoplayStopped')}`,
            `Imagens devolvidas à memória (modo leve): ${n('imagesUnloaded')}`,
            `Vídeos de feed pausados ao sair da tela: ${n('feedPaused')}`,
            `Imagens ampliadas: ${n('imagesEnlarged')}`,
            s.since ? `Desde ${new Date(s.since).toLocaleDateString('pt-BR')}` : '',
        ].filter(Boolean).join('\n');
    }

    const rate = (value, good, poor) => (value == null ? '—' : value <= good ? 'bom' : value <= poor ? 'regular' : 'ruim');
    const rateClass = r => (r === 'bom' ? 'good' : r === 'regular' ? 'mid' : r === 'ruim' ? 'bad' : '');

    function renderVitals() {
        const v = state?.vitals;
        const pre = $('vitalsText');
        if (!v) {
            pre.textContent = 'Sem dados: recarregue a página e tente de novo.';
            return;
        }
        const row = (name, value, text, r) => `${name.padEnd(5)} ${text.padEnd(10)} ${r}`;
        const lcp = v.lcp == null ? null : v.lcp;
        const fcp = v.fcp == null ? null : v.fcp;
        const lines = [
            ['LCP', lcp, lcp == null ? '—' : (lcp / 1000).toFixed(2) + ' s', rate(lcp, 2500, 4000)],
            ['FCP', fcp, fcp == null ? '—' : (fcp / 1000).toFixed(2) + ' s', rate(fcp, 1800, 3000)],
            ['CLS', v.cls, (v.cls || 0).toFixed(3), rate(v.cls || 0, 0.1, 0.25)],
            ['INP', v.inp, v.inp == null ? '— (interaja)' : Math.round(v.inp) + ' ms', rate(v.inp, 200, 500)],
        ];
        pre.replaceChildren();
        for (const [name, value, text, r] of lines) {
            const span = document.createElement('span');
            span.className = rateClass(r);
            span.textContent = row(name, value, text, r);
            pre.append(span, document.createTextNode('\n'));
        }
    }

    async function renderHeaps() {
        const list = $('heapList');
        list.replaceChildren();
        let heaps = {};
        try {
            heaps = (await chrome.storage.session.get('heaps')).heaps || {};
        } catch {
            heaps = {};
        }
        const rows = [];
        for (const [id, info] of Object.entries(heaps)) {
            let tabInfo = null;
            try {
                tabInfo = await chrome.tabs.get(Number(id));
            } catch {
                continue;
            }
            if (tabInfo.discarded) continue;
            rows.push({ id: Number(id), info, tabInfo });
        }
        rows.sort((a, b) => b.info.used - a.info.used);
        if (!rows.length) {
            const p = document.createElement('p');
            p.className = 'muted small';
            p.textContent = 'Ainda sem dados: as abas informam a cada minuto.';
            list.append(p);
            return;
        }
        for (const { id, info, tabInfo } of rows.slice(0, 8)) {
            const el = document.createElement('div');
            el.className = 'heap';
            const text = document.createElement('div');
            text.className = 'grow';
            const strong = document.createElement('strong');
            strong.textContent = info.title || info.host;
            const small = document.createElement('span');
            small.textContent = `${info.host} · ${(info.used / 1048576).toFixed(0)} MB`;
            text.append(strong, small);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn';
            button.textContent = 'Suspender';
            button.disabled = tabInfo.active || tabInfo.audible === true;
            button.title = button.disabled ? 'Aba ativa ou tocando áudio' : 'Libera a memória desta aba (ela recarrega ao voltar)';
            button.addEventListener('click', async () => {
                try {
                    await chrome.tabs.discard(id);
                } catch { /* aba protegida pelo navegador */ }
                renderHeaps();
            });
            el.append(text, button);
            list.append(el);
        }
    }

    function renderThemeParts() {
        const box = $('themeParts');
        box.replaceChildren();
        const on = themePartsOf(store.config.themeParts);
        for (const [id, name, desc] of THEME_PARTS) {
            box.append(featureRow({ name, desc }, on[id], async value => {
                const parts = { ...themePartsOf(store.config.themeParts), [id]: value };
                store.config = { ...store.config, themeParts: parts };
                await save({ [STORE.config]: store.config });
            }));
        }
    }

    function renderDefaults() {
        renderCats($('catsDefaults'), CATS_DEFAULTS);
        document.querySelectorAll('#tab-defaults .field[data-cat]').forEach(el => { el.hidden = el.dataset.cat !== viewOf(CATS_DEFAULTS); });
        renderThemeParts();
        groupedList($('defaultFeatures'), f => featureRow(f, defaultOf(f), async value => {
            const defaults = { ...store.defaults };
            if (value === f.def) delete defaults[f.id];
            else defaults[f.id] = value;
            store.defaults = defaults;
            await save({ [STORE.defaults]: defaults });
            await refreshState();
        }));
        fillSelect($('panelTheme'), Object.entries(PANEL_THEMES), PANEL_THEMES[store.config.theme] ? store.config.theme : 'orange');
        fillSelect($('pageTheme'), Object.entries(PAGE_THEMES).map(([id, t]) => [id, t.name]), PAGE_THEMES[store.config.pageTheme] ? store.config.pageTheme : 'dark');
        $('blockLevel').value = String(Number(store.config.blockLevel) || 0);
        $('tabsToggle').setAttribute('aria-checked', String(store.tabs.enabled === true));
        $('tabsMinutes').value = String(store.tabs.minutes || 30);
        $('tabsProtect').value = (store.tabs.protect || []).join('\n');
        $('blockedHosts').value = (store.config.blockedHosts || []).join('\n');
        $('allowedHosts').value = (store.config.allowedPopupHosts || []).join('\n');
    }

    function renderMaster() {
        $('masterToggle').setAttribute('aria-checked', String(!store.off));
        $('masterLabel').textContent = store.off ? 'Extensão desligada' : 'Extensão ligada';
        document.body.classList.toggle('is-off', store.off);
    }

    async function refreshState(withDiag = false) {
        state = null;
        if (tab?.id && key) {
            try {
                state = await chrome.tabs.sendMessage(tab.id, { type: 'WS_STATE', diagnostics: withDiag });
            } catch {
                state = null;           // página sem o script de conteúdo (aberta antes de instalar, ou restrita)
            }
        }
        renderPage();
        if (withDiag) {
            await loadStore();
            renderStats();
        }
        if (withDiag) {
            renderVitals();
            renderHeaps();
        }
        if (withDiag) $('diagText').textContent = state?.diagnostics || 'Sem dados: recarregue a página e tente de novo.';
    }

    function setTab(name) {
        document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
        for (const id of ['page', 'defaults', 'diag']) $('tab-' + id).hidden = id !== name;
        // A engrenagem abre os ajustes (Padrões e Diagnóstico); de novo, volta para a página.
        const inSettings = name !== 'page';
        $('settingsNav').hidden = !inSettings;
        $('settingsBtn').setAttribute('aria-expanded', String(inSettings));
        if (name === 'diag') refreshState(true);
    }

    /* ------------------------------ início ------------------------------ */
    async function init() {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        key = tab?.url ? pageKeyOf(tab.url) : '';
        if (key && !/^https?:/.test(key)) key = '';
        try {
            host = key ? new URL(key).hostname : '';
        } catch {
            host = '';
        }
        $('pageLabel').textContent = key || 'Página não suportada';

        await loadStore();
        renderMaster();
        renderDefaults();
        await refreshState();

        document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
        $('settingsBtn').addEventListener('click', () => setTab($('settingsBtn').getAttribute('aria-expanded') === 'true' ? 'page' : 'defaults'));

        const master = $('masterToggle');
        const flipMaster = async () => {
            store.off = !store.off;
            await save({ [STORE.off]: store.off });
            renderMaster();
            await refreshState();
        };
        master.addEventListener('click', flipMaster);
        master.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                flipMaster();
            }
        });

        const exclude = $('excludeToggle');
        const flipExclude = async () => {
            const entry = pageEntry();
            await writePage({ excluded: !entry.excluded, overrides: entry.overrides || {} });
            await refreshState();
        };
        exclude.addEventListener('click', flipExclude);
        exclude.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                flipExclude();
            }
        });

        $('quickPage').addEventListener('click', async () => {
            const id = $('quickFeature').value;
            if (!id) return;
            const entry = pageEntry();
            await writePage({ excluded: entry.excluded === true, overrides: { ...entry.overrides, [id]: false } });
            await refreshState();
        });
        $('quickSite').addEventListener('click', async () => {
            const id = $('quickFeature').value;
            if (!id || !host) return;
            await writeHost({ ...hostOverrides(), [id]: false });
            await refreshState();
        });

        $('resetPage').addEventListener('click', async () => {
            await writePage({ excluded: false, overrides: {} });
            await refreshState();
        });

        const hosts = text => text.split('\n').map(x => x.trim().toLowerCase()).filter(Boolean);
        const saveConfig = async () => {
            store.config = { ...store.config, blockedHosts: hosts($('blockedHosts').value), allowedPopupHosts: hosts($('allowedHosts').value) };
            await save({ [STORE.config]: store.config });
        };
        $('blockedHosts').addEventListener('change', saveConfig);
        $('allowedHosts').addEventListener('change', saveConfig);

        $('panelTheme').addEventListener('change', async () => {
            store.config = { ...store.config, theme: $('panelTheme').value };
            document.documentElement.dataset.theme = store.config.theme;
            await save({ [STORE.config]: store.config });
        });
        $('pageTheme').addEventListener('change', async () => {
            store.config = { ...store.config, pageTheme: $('pageTheme').value };
            await save({ [STORE.config]: store.config });
        });
        $('cfgExport').addEventListener('click', exportConfig);
        $('cfgImport').addEventListener('click', () => $('cfgFile').click());
        $('cfgFile').addEventListener('change', async () => {
            const file = $('cfgFile').files?.[0];
            $('cfgFile').value = '';
            if (file && file.size < 2_000_000) await importConfig(file);
            else $('cfgMsg').textContent = 'Arquivo grande demais.';
        });

        $('blockLevel').addEventListener('change', async () => {
            store.config = { ...store.config, blockLevel: Number($('blockLevel').value) || 0 };
            await save({ [STORE.config]: store.config });
            renderPage();
        });

        const saveTabs = async () => {
            store.tabs = { enabled: store.tabs.enabled === true, minutes: Number($('tabsMinutes').value) || 30, protect: hosts($('tabsProtect').value) };
            await save({ [STORE.tabs]: store.tabs });
        };
        const tabsToggle = $('tabsToggle');
        const flipTabs = async () => {
            store.tabs = { ...store.tabs, enabled: !store.tabs.enabled };
            tabsToggle.setAttribute('aria-checked', String(store.tabs.enabled));
            await saveTabs();
        };
        tabsToggle.addEventListener('click', flipTabs);
        tabsToggle.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                flipTabs();
            }
        });
        $('tabsMinutes').addEventListener('change', saveTabs);
        $('tabsProtect').addEventListener('change', saveTabs);

        const blockToggle = $('blockToggle');
        const flipBlock = async () => {
            const next = { ...hostOverrides() };
            if (next.blocker === false) delete next.blocker;
            else next.blocker = false;
            await writeHost(next);
            renderPage();
        };
        blockToggle.addEventListener('click', flipBlock);
        blockToggle.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                flipBlock();
            }
        });

        $('safeMode').addEventListener('click', async () => {
            if (!key) return;
            await writePage({ excluded: true, overrides: {} });
            if (tab?.id) chrome.tabs.reload(tab.id);
            await refreshState();
        });

        $('statsReset').addEventListener('click', async () => {
            store.stats = {};
            await save({ [STORE.stats]: {} });
            renderStats();
        });

        $('diagRefresh').addEventListener('click', () => refreshState(true));
        $('diagCopy').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText($('diagText').textContent);
                $('diagMsg').textContent = 'Relatório copiado.';
            } catch {
                $('diagMsg').textContent = 'Não foi possível copiar.';
            }
        });
    }

    init();
})();
