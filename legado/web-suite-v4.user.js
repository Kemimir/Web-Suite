// ==UserScript==
// @name         Web Suite — Conexão, Desempenho, Privacidade e Tema
// @namespace    https://example.com/web-suite
// @version      4.0.0
// @description  Recursos independentes, painel, diagnóstico e exclusões por página. Compatível com a extensão BOAnimes na Crunchyroll (lá só roda o que não se sobrepõe).
// @match        http://*/*
// @match        https://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @sandbox      raw
// @run-at       document-start
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    /* ------------------------------------------------------------------ *
     *  CONFIGURAÇÃO
     * ------------------------------------------------------------------ */
    const CONFIG = {
        blockedHosts: [],             // Ex.: ['anuncios.example']
        allowedPopupHosts: [],        // Ex.: ['accounts.google.com']
        hotkey: { alt: true, shift: true, key: 'w' },   // Alt+Shift+W abre/fecha o painel
        debug: false,
    };

    /**
     * Perfis por domínio. `only` = lista fechada de funções permitidas ali.
     * Na Crunchyroll a extensão BOAnimes já cuida de imagens, vídeo, tema, banners e
     * rolagem, e observa a página de um jeito próprio. Para uma não atrapalhar a outra,
     * aqui só ficam funções que não tocam no DOM nem no player:
     *   - tracking: só reescreve o endereço (remove utm_* etc.);
     *   - connect: um <link rel=preconnect> a mais.
     * O botão flutuante também some (ele cobriria os controles do player): use Alt+Shift+W
     * ou o menu do gerenciador de scripts.
     */
    const PROFILES = [
        {
            hosts: ['crunchyroll.com'],
            only: ['tracking', 'connect', 'offline'],
            hideButton: true,
            note: 'Perfil de convivência com a extensão BOAnimes',
        },
    ];

    const W = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    const PREFIX = 'web-suite:v4:';
    const INSTANCE = '__webSuiteV4Installed__';

    if (window[INSTANCE]) return;
    window[INSTANCE] = true;

    // A versão 3 usa as mesmas ideias (e o mesmo window.open): rodar as duas juntas duplica tudo.
    if (window.__webSuiteV3Installed__) {
        console.warn('[Web Suite 4] A versão 3 está ativa nesta página. Desative-a no gerenciador de scripts.');
        return;
    }

    /* ------------------------------------------------------------------ *
     *  FUNÇÕES: [id, nome, padrão, descrição, grupo]
     * ------------------------------------------------------------------ */
    const FEATURES = [
        // Conexão
        ['prefetch', 'Pré-carregar links ao passar o mouse', true, 'Começa a buscar a próxima página quando o mouse repousa ~80 ms sobre um link do mesmo site. Ignora sair/excluir/comprar, não faz nada em Save-Data ou conexão lenta.', 'Conexão'],
        ['thirdparty', 'Preparar conexões de terceiros', true, 'Depois do carregamento, faz preconnect às 3 origens externas mais usadas pela página (CDN, fontes, mídia). Sem baixar nada além do aperto de mão.', 'Conexão'],
        ['adaptive', 'Modo econômico em conexão lenta', true, 'Com Save-Data ou rede 2G/3G, liga sozinho lazy de imagens/iframes e reduz o pré-carregamento de vídeo (a menos que você tenha decidido o contrário na página).', 'Conexão'],
        ['retry', 'Recarregar imagens que falharam', true, 'Quando a internet volta, tenta de novo as imagens que não carregaram (no máximo 30 por vez).', 'Conexão'],
        ['offline', 'Aviso de conexão', true, 'Mostra um aviso discreto quando a internet cai e quando volta.', 'Conexão'],
        ['connect', 'Preparar conexões de mídia conhecidas', false, 'No máximo uma conexão conhecida por site (YouTube, Twitch, Crunchyroll). Sem prefetch de vídeos.', 'Conexão'],
        // Privacidade e segurança
        ['popups', 'Bloquear pop-ups via window.open', true, 'Bloqueia novas janelas; links normais continuam funcionando. Exceções em CONFIG.', 'Privacidade'],
        ['tracking', 'Limpar parâmetros de rastreamento', true, 'Remove utm_*, fbclid e similares. Preserva parâmetros funcionais e URLs assinadas.', 'Privacidade'],
        // Desempenho
        ['images', 'Otimizar imagens fora da tela', true, 'Lazy loading abaixo da tela; respeita imagens prioritárias e opções explícitas do site.', 'Desempenho'],
        ['iframes', 'Adiar iframes fora da tela', true, 'Aplica lazy loading somente a iframes distantes e sem opção explícita.', 'Desempenho'],
        ['feed', 'Renderização leve de feeds', false, 'Somente cartões do YouTube e X/Twitter. Nunca o player ou todas as listas.', 'Desempenho'],
        ['motion', 'Reduzir animações', false, 'Encurta animações e transições CSS a quase zero. Menos trabalho de pintura em páginas pesadas.', 'Desempenho'],
        ['effects', 'Reduzir transparência e scroll suave', false, 'Remove backdrop-filter e rolagem suave; pode mudar o visual.', 'Desempenho'],
        // Mídia
        ['offscreen', 'Pausar vídeos silenciosos fora da tela', false, 'Pausa apenas vídeos mudos. Preserva Picture-in-Picture e tela cheia.', 'Mídia'],
        ['hidden', 'Pausar vídeos ao ocultar a aba', false, 'Pode interromper música e transmissões em segundo plano. Não retoma automaticamente.', 'Mídia'],
        ['preload', 'Reduzir pré-carregamento de vídeos', false, 'Sugere metadata somente quando o site não especifica preload.', 'Mídia'],
        ['autoplay', 'Remover autoplay declarado', false, 'Remove o atributo autoplay; não impede play() chamado pelo site.', 'Mídia'],
        // Aparência e limpeza
        ['dark', 'Tema escuro', false, 'Tema por CSS, sem inverter imagens. Opcional para não disputar com o tema do site.', 'Aparência'],
        ['banners', 'Ocultar banners conhecidos', false, 'Oculta alguns banners de consentimento, newsletter e espaços de anúncios. Não decide consentimento.', 'Aparência'],
        ['sidebars', 'Ocultar barras laterais', false, 'Oculta aside e role=complementary. Pode esconder navegação útil.', 'Aparência'],
    ];

    const defaults = Object.fromEntries(FEATURES.map(([id, , on]) => [id, on]));
    const ADAPTIVE_TARGETS = ['images', 'iframes', 'preload'];

    /* ------------------------------------------------------------------ *
     *  ESTADO
     * ------------------------------------------------------------------ */
    // Ignora ?query e #fragmento.
    const pageKey = () => location.origin + location.pathname;

    let key = pageKey();
    let settings = load();
    let domReady = false;
    let ui;
    let slow = false;                 // rede lenta / economia de dados
    const active = new Map();

    const normalizeHost = x => String(x).trim().toLowerCase().replace(/\.+$/, '');

    const matchesHost = (host, list) => list.some(value => {
        const entry = normalizeHost(value);
        const h = normalizeHost(host);
        return entry && (h === entry || h.endsWith('.' + entry));
    });

    const hostIs = host => matchesHost(location.hostname, [host]);

    const log = (...message) => {
        if (CONFIG.debug) console.debug('[Web Suite]', ...message);
    };

    // Perfil do site atual (a chave de teste só vale com debug ligado).
    const profile = (() => {
        let host = location.hostname;
        if (CONFIG.debug) {
            try { host = localStorage.getItem(PREFIX + 'force-profile') || host; } catch { /* sem acesso */ }
        }
        return PROFILES.find(p => matchesHost(host, p.hosts)) || null;
    })();

    const allowed = id => !profile || profile.only.includes(id);

    function load() {
        try {
            const raw = GM_getValue(PREFIX + key, {});
            const value = raw && typeof raw === 'object' ? raw : {};
            const overrides = {};

            for (const [id] of FEATURES) {
                if (typeof value.overrides?.[id] === 'boolean') overrides[id] = value.overrides[id];
            }

            return { excluded: value.excluded === true, overrides };
        } catch {
            return { excluded: false, overrides: {} };
        }
    }

    function enabled(id) {
        if (settings.excluded || !allowed(id)) return false;
        const explicit = settings.overrides[id];
        if (typeof explicit === 'boolean') return explicit;
        if (slow && ADAPTIVE_TARGETS.includes(id) && settings.overrides.adaptive !== false && defaults.adaptive) return true;
        return defaults[id];
    }

    function save(next) {
        try {
            GM_setValue(PREFIX + key, next);
            settings = next;
            reconcile();
        } catch {
            if (ui) ui.status.textContent = 'Não foi possível salvar. Nenhuma configuração foi alterada.';
        }
    }

    /* ------------------------------------------------------------------ *
     *  UTILITÁRIOS
     * ------------------------------------------------------------------ */
    function parseUrl(value) {
        try {
            return new URL(value, document.baseURI);
        } catch {
            return null;
        }
    }

    function cleanUrl(raw) {
        const url = parseUrl(raw);
        if (!url || !['http:', 'https:'].includes(url.protocol)) return raw;

        // Preserva a codificação dos parâmetros que não são removidos.
        const pairs = url.search.slice(1).split('&');

        const names = pairs.map(pair => {
            try {
                return decodeURIComponent(pair.split('=')[0].replace(/\+/g, ' ')).toLowerCase();
            } catch {
                return '';
            }
        });

        const signed = /^(?:signature|sig|token|policy|key-pair-id|x-amz-.+|x-goog-.+)$/;
        if (names.some(name => signed.test(name))) return raw;

        const trackers = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_eid|_hsenc|_hsmi|yclid|twclid|igshid)$/;
        const kept = pairs.filter((_, i) => !trackers.test(names[i]));
        if (kept.length === pairs.length) return raw;

        url.search = kept.length ? '?' + kept.join('&') : '';
        return url.href;
    }

    // Restaura somente valores que ainda pertencem à suíte.
    // WeakMap não retém elementos removidos de feeds infinitos.
    function attributes(id) {
        const marker = 'data-web-suite-' + id;
        const originals = new WeakMap();

        return {
            set(el, name, value) {
                let record = originals.get(el);
                if (!record) {
                    record = new Map();
                    originals.set(el, record);
                }

                if (!record.has(name)) {
                    record.set(name, { before: el.getAttribute(name), applied: value });
                } else {
                    record.get(name).applied = value;
                }

                el.setAttribute(marker, '');
                if (value === null) el.removeAttribute(name);
                else el.setAttribute(name, value);
            },

            stop() {
                document.querySelectorAll('[' + marker + ']').forEach(el => {
                    for (const [name, saved] of originals.get(el) || []) {
                        if (el.getAttribute(name) !== saved.applied) continue;
                        if (saved.before === null) el.removeAttribute(name);
                        else el.setAttribute(name, saved.before);
                    }
                    el.removeAttribute(marker);
                });
            },
        };
    }

    function styleModule(css) {
        const style = document.createElement('style');
        style.dataset.webSuite = '';
        style.textContent = css;
        (document.head || document.documentElement).append(style);
        return { stop: () => style.remove() };
    }

    function linkTag(rel, href, extra = {}) {
        const link = document.createElement('link');
        link.rel = rel;
        link.href = href;
        link.dataset.webSuite = '';
        Object.assign(link, extra);
        (document.head || document.documentElement).append(link);
        return link;
    }

    function each(root, selector, fn) {
        if (root.nodeType === 1 && root.matches(selector)) fn(root);
        root.querySelectorAll?.(selector).forEach(fn);
    }

    function protectedVideo(video) {
        return document.pictureInPictureElement === video
            || !!document.fullscreenElement?.contains(video)
            || !!video.webkitDisplayingFullscreen;
    }

    function belowScreen(el) {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.top > innerHeight + 300;
    }

    /* ------------------------------------------------------------------ *
     *  REDE: economia de dados e conexão
     * ------------------------------------------------------------------ */
    const connection = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

    function isSlow() {
        const c = connection();
        if (!c) return false;
        return c.saveData === true || /(^|-)2g$|^3g$/.test(c.effectiveType || '');
    }

    function refreshNetwork() {
        const next = isSlow();
        if (next === slow) return;
        slow = next;
        log('rede lenta:', slow);
        if (domReady) reconcile();
    }

    connection()?.addEventListener?.('change', refreshNetwork);
    slow = isSlow();

    /* ------------------------------------------------------------------ *
     *  MÓDULOS
     * ------------------------------------------------------------------ */
    const factories = {
        popups() {
            const original = W.open;

            function wrapped(url = '', target = '_blank', ...rest) {
                syncRoute();

                if (!enabled('popups')) return Reflect.apply(original, W, [url, target, ...rest]);

                const raw = String(url);
                const dest = parseUrl(raw);
                const name = String(target);

                if (!dest || !['http:', 'https:', 'about:'].includes(dest.protocol) || matchesHost(dest.hostname, CONFIG.blockedHosts)) {
                    return null;
                }

                const existing = ['_self', '_parent', '_top'].includes(name.toLowerCase());
                const okPopup = ['http:', 'https:'].includes(dest.protocol)
                    && matchesHost(dest.hostname, CONFIG.allowedPopupHosts)
                    && W.navigator.userActivation?.isActive === true;

                if (!existing && !okPopup) {
                    log('Pop-up bloqueado.');
                    return null;
                }

                return Reflect.apply(original, W, [raw, name, ...rest]);
            }

            W.open = wrapped;
            return { stop() { if (W.open === wrapped) W.open = original; } };
        },

        tracking() {
            const changes = attributes('tracking');
            const cleaned = cleanUrl(location.href);

            if (cleaned !== location.href) {
                try {
                    W.history.replaceState(W.history.state, '', cleaned);
                } catch {
                    log('URL atual não alterada.');
                }
            }

            return {
                ...changes,
                link(el) {
                    const raw = el.getAttribute('href');
                    const value = cleanUrl(raw);
                    if (value !== raw) changes.set(el, 'href', value);
                },
            };
        },

        images() {
            const changes = attributes('images');
            return {
                ...changes,
                scan(root) {
                    each(root, 'img', img => {
                        if (img.hasAttribute('loading') || img.getAttribute('fetchpriority') === 'high' || img.complete || !belowScreen(img)) return;
                        changes.set(img, 'loading', 'lazy');
                        if (!img.hasAttribute('decoding')) changes.set(img, 'decoding', 'async');
                    });
                },
            };
        },

        iframes() {
            const changes = attributes('iframes');
            return {
                ...changes,
                scan(root) {
                    each(root, 'iframe', frame => {
                        if (!frame.hasAttribute('loading') && belowScreen(frame)) changes.set(frame, 'loading', 'lazy');
                    });
                },
            };
        },

        /* Instant-page: busca a próxima página quando o mouse repousa sobre o link. */
        prefetch() {
            const done = new Set();
            const links = [];
            let timer = 0;
            let target = null;
            const LIMIT = 20;
            const avoid = /(logout|log-out|signout|sign-out|logoff|delete|remove|unsubscribe|checkout|cart|payment|billing|download|\.(?:zip|exe|dmg|pdf|apk)(?:$|\?))/i;

            function eligible(a) {
                if (!a || !a.href || a.hasAttribute('download') || a.dataset.noPrefetch !== undefined) return null;
                if (a.target && a.target.toLowerCase() === '_blank') return null;
                const dest = parseUrl(a.getAttribute('href'));
                if (!dest || !['http:', 'https:'].includes(dest.protocol) || dest.origin !== location.origin) return null;
                if (dest.pathname + dest.search === location.pathname + location.search) return null;
                if (avoid.test(dest.pathname + dest.search)) return null;
                dest.hash = '';
                return dest.href;
            }

            function fetchNow(a) {
                if (slow || document.hidden || done.size >= LIMIT) return;
                const href = eligible(a);
                if (!href || done.has(href)) return;
                done.add(href);
                links.push(linkTag('prefetch', href, { as: 'document', fetchPriority: 'low' }));
            }

            const over = event => {
                const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
                if (!a || a === target) return;
                clearTimeout(timer);
                target = a;
                timer = setTimeout(() => fetchNow(a), 80);
            };
            const out = event => {
                const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
                if (a && a === target) {
                    clearTimeout(timer);
                    target = null;
                }
            };
            const touch = event => {
                const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
                if (a) fetchNow(a);
            };

            document.addEventListener('mouseover', over, { passive: true });
            document.addEventListener('mouseout', out, { passive: true });
            document.addEventListener('touchstart', touch, { passive: true });

            return {
                stop() {
                    clearTimeout(timer);
                    document.removeEventListener('mouseover', over);
                    document.removeEventListener('mouseout', out);
                    document.removeEventListener('touchstart', touch);
                    links.forEach(l => l.remove());
                },
            };
        },

        /* Preconnect às origens externas mais usadas (descobertas pelo Resource Timing). */
        thirdparty() {
            const added = [];

            const run = () => {
                const counts = new Map();
                for (const r of performance.getEntriesByType('resource')) {
                    if (!['script', 'css', 'link', 'img', 'fetch', 'xmlhttprequest', 'iframe'].includes(r.initiatorType)) continue;
                    const u = parseUrl(r.name);
                    if (!u || u.origin === location.origin || !/^https?:$/.test(u.protocol)) continue;
                    counts.set(u.origin, (counts.get(u.origin) || 0) + 1);
                }

                const existing = new Set([...document.querySelectorAll('link[rel="preconnect"]')].map(l => l.href.replace(/\/$/, '')));
                [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([origin]) => {
                    if (existing.has(origin)) return;
                    added.push(linkTag('preconnect', origin, { crossOrigin: 'anonymous' }));
                });
            };

            const timer = setTimeout(run, 1500);
            return { stop() { clearTimeout(timer); added.forEach(el => el.remove()); } };
        },

        /* O estado de adaptive é lido por enabled(); este módulo só existe para aparecer ativo. */
        adaptive: () => ({ stop() {} }),

        retry() {
            const retryAll = () => {
                let n = 0;
                document.querySelectorAll('img').forEach(img => {
                    if (n >= 30) return;
                    const src = img.currentSrc || img.src;
                    if (img.complete && img.naturalWidth === 0 && src && !src.startsWith('data:') && !src.startsWith('blob:')) {
                        n += 1;
                        img.src = src;
                    }
                });
                if (n) log('imagens recarregadas:', n);
            };

            window.addEventListener('online', retryAll);
            return { stop: () => window.removeEventListener('online', retryAll) };
        },

        offline() {
            const show = text => notify(text);
            const down = () => show('Sem conexão com a internet');
            const up = () => show('Conexão restabelecida');

            window.addEventListener('offline', down);
            window.addEventListener('online', up);

            return {
                stop() {
                    window.removeEventListener('offline', down);
                    window.removeEventListener('online', up);
                },
            };
        },

        motion: () => styleModule(`
            *,*::before,*::after {
                animation-duration:.01ms!important;
                animation-delay:0s!important;
                animation-iteration-count:1!important;
                transition-duration:.01ms!important;
                transition-delay:0s!important;
                scroll-behavior:auto!important
            }
        `),

        dark: () => styleModule(`
            html,body {
                background-color:#121212!important;
                color:#eee!important;
                color-scheme:dark!important
            }
            main,article,section,header,footer,nav,aside,dialog {
                background-color:#191919!important;
                color:#eee!important
            }
            p,li,label,h1,h2,h3,h4,h5,h6 { color:#eee!important }
            a { color:#8ab4f8!important }
            a:visited { color:#c6a5f7!important }
            table,th,td,pre,code,kbd,samp,blockquote {
                background-color:#242424!important;
                color:#eee!important;
                border-color:#555!important
            }
            input,textarea,select,button { color-scheme:dark }
        `),

        effects: () => styleModule(`
            * {
                backdrop-filter:none!important;
                -webkit-backdrop-filter:none!important
            }
            html,body { scroll-behavior:auto!important }
        `),

        feed() {
            const selector = hostIs('youtube.com')
                ? 'ytd-rich-item-renderer'
                : hostIs('x.com') || hostIs('twitter.com')
                    ? '[data-testid="cellInnerDiv"]'
                    : '';

            return selector
                ? styleModule(`${selector}{content-visibility:auto;contain-intrinsic-size:auto 500px}`)
                : { stop() {} };
        },

        offscreen() {
            if (typeof IntersectionObserver === 'undefined') return { stop() {} };

            const observed = new WeakSet();
            const io = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    const v = entry.target;
                    if (!entry.isIntersecting && !v.paused && v.muted && !protectedVideo(v)) v.pause();
                }
            }, { threshold: 0 });

            return {
                scan(root) {
                    each(root, 'video', v => {
                        if (!observed.has(v)) {
                            observed.add(v);
                            io.observe(v);
                        }
                    });
                },
                removed(root) {
                    each(root, 'video', v => {
                        io.unobserve(v);
                        observed.delete(v);
                    });
                },
                stop: () => io.disconnect(),
            };
        },

        hidden() {
            const pause = () => {
                if (!document.hidden) return;
                document.querySelectorAll('video').forEach(v => {
                    if (!v.paused && !protectedVideo(v)) v.pause();
                });
            };

            document.addEventListener('visibilitychange', pause);
            return { stop: () => document.removeEventListener('visibilitychange', pause) };
        },

        preload() {
            const changes = attributes('preload');
            return {
                ...changes,
                scan(root) {
                    each(root, 'video', v => {
                        if (!v.hasAttribute('preload') && v.paused) changes.set(v, 'preload', 'metadata');
                    });
                },
            };
        },

        autoplay() {
            const changes = attributes('autoplay');
            return {
                ...changes,
                scan(root) {
                    each(root, 'video[autoplay]', v => changes.set(v, 'autoplay', null));
                },
            };
        },

        connect() {
            const url = hostIs('youtube.com')
                ? 'https://i.ytimg.com'
                : hostIs('twitch.tv')
                    ? 'https://static-cdn.jtvnw.net'
                    : hostIs('crunchyroll.com')
                        ? 'https://img1.ak.crunchyroll.com'
                        : '';

            if (!url) return { stop() {} };

            const exists = [...document.querySelectorAll('link[rel="preconnect"]')].some(el => el.href === url + '/');
            if (exists) return { stop() {} };

            const link = linkTag('preconnect', url, { crossOrigin: 'anonymous' });
            return { stop: () => link.remove() };
        },

        banners: () => styleModule(`
            #onetrust-banner-sdk,
            #CybotCookiebotDialog,
            .newsletter-popup,
            .adsbygoogle,
            [data-ad-slot] { display:none!important }
        `),

        sidebars: () => styleModule(`aside,[role="complementary"]{display:none!important}`),
    };

    /* ------------------------------------------------------------------ *
     *  OBSERVER COMPARTILHADO (só existe se algum módulo precisa varrer o DOM)
     * ------------------------------------------------------------------ */
    let observer;
    let timer = 0;
    const pending = new Set();

    function scan(root) {
        for (const module of active.values()) {
            try {
                module.scan?.(root);
            } catch {
                log('Um elemento não pôde ser otimizado.');
            }
        }
    }

    function watch() {
        observer?.disconnect();
        clearTimeout(timer);
        timer = 0;
        pending.clear();

        if (![...active.values()].some(m => m.scan)) return;

        observer = new MutationObserver(records => {
            if (syncRoute()) return;

            for (const record of records) {
                for (const node of record.removedNodes) {
                    if (node.nodeType !== 1) continue;
                    for (const module of active.values()) module.removed?.(node);
                }
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1) pending.add(node);
                }
            }

            if (pending.size > 100) {
                pending.clear();
                pending.add(document.documentElement);
            }

            if (!timer && pending.size) {
                timer = setTimeout(() => {
                    timer = 0;
                    const roots = [...pending];
                    pending.clear();
                    for (const root of roots) if (root.isConnected) scan(root);
                }, 80);
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function reconcile(reset = false) {
        observer?.disconnect();
        clearTimeout(timer);
        timer = 0;
        pending.clear();

        for (const [id, module] of active) {
            if (reset || !enabled(id)) {
                try {
                    module.stop();
                } catch {
                    log('Falha ao restaurar um recurso.');
                }
                active.delete(id);
            }
        }

        for (const [id] of FEATURES) {
            if (!enabled(id) || active.has(id) || (!domReady && id !== 'popups')) continue;
            try {
                active.set(id, factories[id]());
            } catch {
                log('Não foi possível iniciar ' + id);
            }
        }

        if (domReady) {
            scan(document);
            watch();
            render();
        }
    }

    function syncRoute() {
        const next = pageKey();
        if (next === key) return false;
        key = next;
        settings = load();
        reconcile(true);
        return true;
    }

    // Links novos são tratados no clique, sem varrer todos os links.
    function onLink(event) {
        if (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0) return;

        syncRoute();
        if (settings.excluded) return;

        const link = event.composedPath().find(el => el instanceof Element && el.matches('a[href],area[href]'));
        if (!link) return;

        const dest = parseUrl(link.getAttribute('href'));

        if (enabled('popups') && dest && matchesHost(dest.hostname, CONFIG.blockedHosts)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        if (active.has('popups') && link.getAttribute('target')?.toLowerCase() === '_blank' && !link.relList.contains('noopener')) {
            const module = active.get('popups');
            module.relChanges ??= attributes('noopener');

            if (!module.originalStop) {
                module.originalStop = module.stop;
                module.stop = () => {
                    module.relChanges.stop();
                    module.originalStop();
                };
            }

            module.relChanges.set(link, 'rel', [...link.relList, 'noopener'].join(' '));
        }

        active.get('tracking')?.link(link);
    }

    window.addEventListener('click', onLink, { capture: true, passive: false });
    window.addEventListener('auxclick', onLink, { capture: true, passive: false });

    /* ------------------------------------------------------------------ *
     *  DIAGNÓSTICO (somente leitura)
     * ------------------------------------------------------------------ */
    let longTasks = 0;
    let longTaskTime = 0;
    try {
        new PerformanceObserver(list => {
            for (const e of list.getEntries()) {
                longTasks += 1;
                longTaskTime += e.duration;
            }
        }).observe({ type: 'longtask', buffered: true });
    } catch { /* sem suporte */ }

    const ms = v => (Number.isFinite(v) && v >= 0 ? Math.round(v) + ' ms' : '—');
    const kb = v => (v >= 1048576 ? (v / 1048576).toFixed(1) + ' MB' : Math.round(v / 1024) + ' KB');

    function diagnostics() {
        const lines = [];
        const nav = performance.getEntriesByType('navigation')[0];
        const c = connection();

        lines.push('Página: ' + key);
        if (profile) lines.push('Perfil: ' + profile.note);

        if (nav) {
            lines.push(`DNS ${ms(nav.domainLookupEnd - nav.domainLookupStart)} · conexão ${ms(nav.connectEnd - nav.connectStart)} · TLS ${ms(nav.secureConnectionStart ? nav.connectEnd - nav.secureConnectionStart : 0)}`);
            lines.push(`1º byte ${ms(nav.responseStart)} · DOM pronto ${ms(nav.domContentLoadedEventEnd)} · carregada ${ms(nav.loadEventEnd)}`);
        }

        const res = performance.getEntriesByType('resource');
        const total = res.reduce((s, r) => s + (r.transferSize || 0), 0);
        const hidden = res.filter(r => !r.transferSize && !r.encodedBodySize).length;
        lines.push(`Recursos: ${res.length} · transferido ${kb(total)}${hidden ? ` (+${hidden} sem tamanho visível, de outros domínios)` : ''}`);

        const heavy = [...res].sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0)).slice(0, 5);
        heavy.forEach(r => {
            if (!r.transferSize) return;
            let name = r.name;
            try { name = new URL(r.name).host + new URL(r.name).pathname.slice(-28); } catch { /* usa o nome inteiro */ }
            lines.push(`  ${kb(r.transferSize).padStart(8)}  ${name}`);
        });

        lines.push(`Elementos no DOM: ${document.getElementsByTagName('*').length} · tarefas longas: ${longTasks} (${ms(longTaskTime)})`);

        const mem = performance.memory;
        if (mem) lines.push(`Memória JS: ${kb(mem.usedJSHeapSize)} de ${kb(mem.jsHeapSizeLimit)}`);

        if (c) {
            lines.push(`Rede: ${c.effectiveType || '?'} · ${c.downlink ?? '?'} Mb/s · ${c.rtt ?? '?'} ms${c.saveData ? ' · economia de dados' : ''}${slow ? ' · modo econômico' : ''}`);
        }

        lines.push(`Funções ativas: ${[...active.keys()].join(', ') || 'nenhuma'}`);
        return lines.join('\n');
    }

    /* ------------------------------------------------------------------ *
     *  AVISOS E PAINEL (Shadow DOM)
     * ------------------------------------------------------------------ */
    let toastTimer = 0;

    function notify(text) {
        if (!ui) return;
        ui.toast.textContent = text;
        ui.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 3500);
    }

    function openPanel(open) {
        const show = open ?? ui.panel.hidden;
        ui.panel.hidden = !show;
        ui.toggle.setAttribute('aria-expanded', String(show));
        // Nos perfis de convivência o botão fica escondido; só aparece com o painel aberto.
        ui.toggle.hidden = !show && !!profile?.hideButton;
        if (show) {
            syncRoute();
            render();
        }
    }

    function mount() {
        const host = document.createElement('div');
        host.id = 'web-suite-v4-panel';

        const position = { position: 'fixed', right: '14px', bottom: '14px', 'z-index': '2147483647' };
        for (const [name, value] of Object.entries(position)) host.style.setProperty(name, value, 'important');

        const root = host.attachShadow({ mode: 'open' });

        root.innerHTML = `
            <style>
                :host { all:initial; font:14px/1.5 system-ui,sans-serif; color:#fff; color-scheme:dark }
                * { box-sizing:border-box }
                button,select { font:inherit }
                button { border:1px solid #70505a; border-radius:8px; padding:9px 12px; background:#34222a; color:#fff; cursor:pointer }
                button:hover { background:#58313e }
                button:disabled { opacity:.45; cursor:default }
                button:focus-visible,select:focus-visible,summary:focus-visible { outline:2px solid #ff8b9d; outline-offset:3px }
                #toggle { float:right; background:#ae1535; border-color:#ef5473 }
                section { width:min(380px,calc(100vw - 28px)); max-height:78vh; overflow:auto; padding:16px; margin-bottom:8px; background:#171319; border:1px solid #954256; border-radius:14px; box-shadow:0 6px 30px #0008 }
                h2 { font-size:17px; margin:0 0 8px }
                p { margin:8px 0; overflow-wrap:anywhere }
                label,select { display:block; width:100% }
                select { margin:6px 0; padding:9px; background:#282029; color:white; border:1px solid #825061; border-radius:8px }
                .row { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px }
                .danger { background:#981730 }
                small { color:#d6bac3 }
                details { margin-top:12px; border-top:1px solid #4a2c36; padding-top:10px }
                summary { cursor:pointer; font-weight:600 }
                pre { margin:8px 0 0; padding:10px; background:#0f0b10; border-radius:8px; font:12px/1.5 ui-monospace,Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; color:#e8d7dc }
                #toast { position:fixed; left:50%; bottom:20px; transform:translateX(-50%); padding:9px 16px; background:#171319; border:1px solid #954256; border-radius:999px; color:#fff; font-size:13px; pointer-events:none }
                [hidden] { display:none!important }
            </style>

            <div id="toast" role="status" aria-live="polite" hidden></div>

            <section id="panel" hidden aria-label="Configurações Web Suite">
                <h2>Web Suite</h2>
                <small id="page"></small>
                <p id="status" role="status" aria-live="polite"></p>

                <div id="controls">
                    <label for="feature">Função</label>
                    <select id="feature"></select>
                    <p id="description"></p>
                    <small id="state"></small>

                    <div class="row">
                        <button id="off">Excluir esta função da página</button>
                        <button id="on">Ativar nesta página</button>
                    </div>
                    <div class="row">
                        <button id="reset">Restaurar padrões desta página</button>
                    </div>
                </div>

                <div class="row">
                    <button id="pageToggle" class="danger">Excluir esta página</button>
                </div>

                <details id="diag">
                    <summary>Diagnóstico desta página</summary>
                    <pre id="diagText"></pre>
                    <div class="row">
                        <button id="diagRefresh">Atualizar</button>
                        <button id="diagCopy">Copiar relatório</button>
                    </div>
                </details>

                <p><small>
                    A exclusão considera domínio + caminho, sem ?parâmetros nem #fragmento.
                    Atalho: Alt+Shift+W.
                </small></p>
            </section>

            <button id="toggle" aria-expanded="false" aria-controls="panel">⚙ Web Suite</button>
        `;

        const get = id => root.getElementById(id);

        ui = Object.fromEntries([
            'panel', 'feature', 'page', 'status', 'description', 'state', 'controls',
            'off', 'on', 'reset', 'pageToggle', 'toggle', 'toast', 'diag', 'diagText',
            'diagRefresh', 'diagCopy',
        ].map(id => [id, get(id)]));
        ui.host = host;
        if (profile?.hideButton) ui.toggle.hidden = true;

        // Funções agrupadas; no perfil restrito só aparecem as permitidas.
        const groups = new Map();
        for (const [id, name, , , group] of FEATURES) {
            if (!allowed(id)) continue;
            if (!groups.has(group)) {
                const og = document.createElement('optgroup');
                og.label = group;
                groups.set(group, og);
                ui.feature.append(og);
            }
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            groups.get(group).append(option);
        }

        ui.feature.addEventListener('change', render);
        ui.toggle.addEventListener('click', () => openPanel());

        const setFunction = value => {
            syncRoute();
            save({ ...settings, overrides: { ...settings.overrides, [ui.feature.value]: value } });
        };

        ui.off.addEventListener('click', () => setFunction(false));
        ui.on.addEventListener('click', () => setFunction(true));

        ui.pageToggle.addEventListener('click', () => {
            syncRoute();
            save({ ...settings, excluded: !settings.excluded });
        });

        ui.reset.addEventListener('click', () => {
            syncRoute();
            save({ excluded: false, overrides: {} });
        });

        ui.diag.addEventListener('toggle', () => { if (ui.diag.open) ui.diagText.textContent = diagnostics(); });
        ui.diagRefresh.addEventListener('click', () => { ui.diagText.textContent = diagnostics(); });
        ui.diagCopy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(diagnostics());
                notify('Relatório copiado');
            } catch {
                notify('Não foi possível copiar');
            }
        });

        root.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                openPanel(false);
                ui.toggle.focus();
            }
        });

        (document.body || document.documentElement).append(host);

        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Abrir painel Web Suite', () => openPanel(true));
        }

        document.addEventListener('keydown', event => {
            const k = CONFIG.hotkey;
            if (event.altKey === !!k.alt && event.shiftKey === !!k.shift && !event.ctrlKey && !event.metaKey
                && event.key.toLowerCase() === k.key
                && !event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) {
                event.preventDefault();
                openPanel();
            }
        }, true);
    }

    function render() {
        if (!ui) return;

        const [id, , , description] = FEATURES.find(([id]) => id === ui.feature.value) || FEATURES.find(([id]) => allowed(id)) || FEATURES[0];

        ui.page.textContent = key + (profile ? ' · ' + profile.note : '');
        ui.description.textContent = description;

        ui.status.textContent = settings.excluded
            ? 'Página excluída. Somente este controle permanece ativo.'
            : `${active.size} funções ativas nesta página.${slow ? ' Modo econômico por rede lenta.' : ''}`;

        ui.state.textContent = enabled(id) ? 'Ativa nesta página' : 'Desativada nesta página';

        ui.off.disabled = !enabled(id);
        ui.on.disabled = enabled(id);
        ui.controls.hidden = settings.excluded;
        ui.pageToggle.textContent = settings.excluded ? 'Reativar esta página' : 'Excluir esta página';
    }

    /* ------------------------------------------------------------------ *
     *  INÍCIO
     * ------------------------------------------------------------------ */
    // Bloqueia window.open antes de esperar pelo DOM.
    reconcile();

    function ready() {
        if (domReady) return;

        domReady = true;
        syncRoute();
        mount();
        reconcile();

        // Navegação em SPAs: o Navigation API avisa sem polling; sem ele, 1,5 s.
        const nav = W.navigation;
        const recheck = () => {
            syncRoute();
            if (!settings.excluded && enabled('tracking')) {
                const cleaned = cleanUrl(location.href);
                if (cleaned !== location.href) {
                    try {
                        W.history.replaceState(W.history.state, '', cleaned);
                    } catch { /* URL protegida */ }
                }
            }
        };

        if (nav && typeof nav.addEventListener === 'function') nav.addEventListener('navigatesuccess', recheck);
        else setInterval(recheck, 1500);
    }

    window.addEventListener('popstate', syncRoute);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ready, { once: true });
    } else {
        ready();
    }
})();
