/*
 * Web Suite — script de conteúdo (mundo isolado). Aplica as funções à página e conversa com o popup.
 * O bloqueio de pop-ups roda no mundo da página (content/page.js) e recebe o estado por evento.
 */
(() => {
    'use strict';

    const { FEATURES, ADAPTIVE_TARGETS, AUTOPLAY_ALLOW, PAGE_THEMES, matchesHost, profileFor, pageKeyOf } = self.WS;

    const INSTANCE = '__webSuiteExtInstalled__';
    if (window[INSTANCE]) return;
    window[INSTANCE] = true;

    const DEBUG = false;
    const log = (...m) => { if (DEBUG) console.debug('[Web Suite]', ...m); };

    /* ------------------------------------------------------------------ *
     *  ESTADO (vem do chrome.storage.local)
     * ------------------------------------------------------------------ */
    const STORE = { defaults: 'ws_defaults', pages: 'ws_pages', hosts: 'ws_hosts', config: 'ws_config', off: 'ws_off' };

    let defaultsStore = {};           // { id: boolean } — padrões globais do usuário
    let pagesStore = {};              // { "origem/caminho": { excluded, overrides } }
    let hostsStore = {};              // { "host": { overrides } } — vale para o site inteiro
    let config = { blockedHosts: [], allowedPopupHosts: [], pageTheme: 'dark' };
    let globalOff = false;            // chave geral da extensão
    let loaded = false;
    let domReady = false;
    let slow = false;

    const profile = profileFor('www.crunchyroll.com');
    const allowed = id => !profile || profile.only.includes(id);
    const pageKey = () => pageKeyOf(location.href);
    let key = pageKey();

    const active = new Map();

    /* ------------------------------------------------------------------ *
     *  ESTATÍSTICAS DE ECONOMIA E ABA "SUJA" (formulário preenchido)
     * ------------------------------------------------------------------ */
    const pendingStats = {};
    let flushTimer = 0;

    function bump(name, n = 1) {
        pendingStats[name] = (pendingStats[name] || 0) + n;
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = 0;
            const add = { ...pendingStats };
            for (const k of Object.keys(pendingStats)) delete pendingStats[k];
            try {
                chrome.runtime.sendMessage({ type: 'WS_STAT', add }).catch(() => undefined);
            } catch { /* extensão recarregada */ }
        }, 4000);
    }

    let dirtySent = false;
    document.addEventListener('input', event => {
        if (dirtySent || !event.isTrusted) return;
        dirtySent = true;
        try {
            chrome.runtime.sendMessage({ type: 'WS_DIRTY' }).catch(() => undefined);
        } catch { /* extensão recarregada */ }
    }, { capture: true, passive: true });

    const pageSettings = () => {
        const raw = pagesStore[key];
        return { excluded: raw?.excluded === true, overrides: raw?.overrides && typeof raw.overrides === 'object' ? raw.overrides : {} };
    };

    const hostOverrides = () => {
        const raw = hostsStore[location.hostname]?.overrides;
        return raw && typeof raw === 'object' ? raw : {};
    };

    const defaultOf = id => (typeof defaultsStore[id] === 'boolean' ? defaultsStore[id] : FEATURES.find(f => f.id === id).def);

    function enabled(id) {
        if (!loaded || globalOff) return false;
        const settings = pageSettings();
        if (settings.excluded || !allowed(id)) return false;
        if (slow && (id === 'prefetch' || id === 'prerender')) return false;
        // Ordem: escolha da página > escolha do site > padrão (com o modo econômico no meio).
        if (typeof settings.overrides[id] === 'boolean') return settings.overrides[id];
        if (typeof hostOverrides()[id] === 'boolean') return hostOverrides()[id];
        if (slow && ADAPTIVE_TARGETS.includes(id) && settings.overrides.adaptive !== false && defaultOf('adaptive')) return true;
        return defaultOf(id);
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

    // Restaura somente valores que ainda pertencem à extensão.
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

                if (!record.has(name)) record.set(name, { before: el.getAttribute(name), applied: value });
                else record.get(name).applied = value;

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

    const protectedVideo = video => document.pictureInPictureElement === video
        || !!document.fullscreenElement?.contains(video)
        || !!video.webkitDisplayingFullscreen;

    function belowScreen(el) {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.top > innerHeight + 300;
    }

    /* ------------------------------------------------------------------ *
     *  REDE
     * ------------------------------------------------------------------ */
    const connection = () => navigator.connection || null;

    function isSlow() {
        const c = connection();
        if (!c) return false;
        return c.saveData === true || /(^|-)2g$|^3g$/.test(c.effectiveType || '');
    }

    function refreshNetwork() {
        const next = isSlow();
        if (next === slow) return;
        slow = next;
        if (loaded && domReady) reconcile();
    }

    connection()?.addEventListener?.('change', refreshNetwork);
    slow = isSlow();

    /* ------------------------------------------------------------------ *
     *  AVISOS (host pequeno com Shadow DOM, criado só quando preciso)
     * ------------------------------------------------------------------ */
    let toast;
    let toastTimer = 0;

    function notify(text) {
        if (!toast) {
            const host = document.createElement('div');
            host.dataset.webSuiteToast = '';
            host.style.cssText = 'position:fixed!important;left:50%!important;bottom:20px!important;transform:translateX(-50%)!important;z-index:2147483647!important;pointer-events:none!important';
            const root = host.attachShadow({ mode: 'closed' });
            const box = document.createElement('div');
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            box.style.cssText = 'padding:9px 16px;background:#171319;border:1px solid #954256;border-radius:999px;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 4px 18px #0007';
            root.append(box);
            (document.body || document.documentElement).append(host);
            toast = { host, box };
        }
        toast.box.textContent = text;
        toast.host.style.removeProperty('display');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.host.style.setProperty('display', 'none', 'important'), 3500);
    }

    /* ------------------------------------------------------------------ *
     *  MÓDULOS
     * ------------------------------------------------------------------ */
    /* ------------------------------------------------------------------ *
     *  PRÉ-CARREGAMENTO
     * ------------------------------------------------------------------ */
    const AVOID_WORDS = ['logout', 'log-out', 'signout', 'sign-out', 'logoff', 'delete', 'remove', 'unsubscribe', 'checkout', 'cart', 'payment', 'billing', 'download'];

    /** Fallback antigo (<link rel=prefetch>), para navegadores sem regras de especulação ou com CSP que as bloqueia. */
    function linkPrefetch() {
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
            bump('prefetched');
            }
    
            const anchorOf = event => (event.target instanceof Element ? event.target.closest('a[href]') : null);
    
            const over = event => {
                const a = anchorOf(event);
                if (!a || a === target) return;
                clearTimeout(timer);
                target = a;
                timer = setTimeout(() => fetchNow(a), 80);
            };
            const out = event => {
                const a = anchorOf(event);
                if (a && a === target) {
                    clearTimeout(timer);
                    target = null;
                }
            };
            const touch = event => {
                const a = anchorOf(event);
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
        }

    /**
     * Regras de especulação (document rules, eagerness "moderate": ~200 ms de hover ou pointerdown).
     * O Chrome limita a 2 por vez (FIFO) e já trata Save-Data. Exclui endereços com efeito colateral.
     */
    function speculation(kind) {
        const supported = typeof HTMLScriptElement !== 'undefined' && HTMLScriptElement.supports?.('speculationrules');
        let script = null;
        let fallback = null;
        const useFallback = () => {
            if (kind === 'prefetch' && !fallback) fallback = linkPrefetch();
        };

        const onViolation = event => {
            if (script && event.blockedURI === 'inline' && /script-src/.test(event.violatedDirective)) {
                script.remove();
                script = null;
                useFallback();
            }
        };

        if (!supported) {
            useFallback();
        } else {
            const rules = {
                [kind]: [{
                    source: 'document',
                    where: {
                        and: [
                            { href_matches: '/*' },
                            ...AVOID_WORDS.map(word => ({ not: { href_matches: '/*' + word + '*' } })),
                            { not: { selector_matches: '[download],[target=_blank],[data-no-prefetch]' } },
                        ],
                    },
                    eagerness: 'moderate',
                }],
            };
            script = document.createElement('script');
            script.type = 'speculationrules';
            script.dataset.webSuite = '';
            script.textContent = JSON.stringify(rules);
            document.addEventListener('securitypolicyviolation', onViolation);
            (document.head || document.documentElement).append(script);
        }

        return {
            stop() {
                document.removeEventListener('securitypolicyviolation', onViolation);
                script?.remove();
                fallback?.stop();
            },
        };
    }

    const factories = {
        popups() {
            // O bloqueio mora no mundo da página; aqui só se avisa o estado.
            pushPopupState(true);
            return { stop: () => pushPopupState(false) };
        },

        tracking() {
            const changes = attributes('tracking');
            const cleaned = cleanUrl(location.href);

            if (cleaned !== location.href) {
                try {
                    history.replaceState(history.state, '', cleaned);
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
                        bump('lazyImages');
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
                        if (!frame.hasAttribute('loading') && belowScreen(frame)) {
                            changes.set(frame, 'loading', 'lazy');
                            bump('lazyIframes');
                        }
                    });
                },
            };
        },

        /* Regras de especulação: o próprio Chrome guarda o próximo documento em memória. */
        prefetch: () => speculation('prefetch'),
        prerender: () => speculation('prerender'),

        /* Fachadas: no lugar do player do YouTube/Vimeo, uma miniatura com play; o player só carrega no clique. */
        facades() {
            const records = new Map();   // iframe -> { facade, src, display }

            function parts(url) {
                const h = url.hostname.replace(/^www\./, '');
                if (/^youtube(-nocookie)?\.com$/.test(h)) {
                    const m = url.pathname.match(/^\/embed\/([\w-]{6,})$/);
                    if (m) return { kind: 'youtube', id: m[1] };
                } else if (h === 'player.vimeo.com') {
                    const m = url.pathname.match(/^\/video\/(\d+)/);
                    if (m) return { kind: 'vimeo', id: m[1] };
                }
                return null;
            }

            function build(frame) {
                if (records.has(frame) || frame.hasAttribute('data-web-suite-facade')) return;
                const src = frame.getAttribute('src') || '';
                const url = parseUrl(src);
                if (!url) return;
                const info = parts(url);
                if (!info) return;
                // Sites que controlam o player por API quebrariam: deixa em paz.
                if (/(?:^|[?&])(?:enablejsapi|api)=1/.test(url.search)) return;

                const box = frame.getBoundingClientRect();
                const width = Math.round(box.width || Number(frame.getAttribute('width')) || 560);
                const height = Math.round(box.height || Number(frame.getAttribute('height')) || 315);
                if (width < 120 || height < 70) return;

                const facade = document.createElement('div');
                facade.dataset.webSuiteFacadeHost = '';
                facade.setAttribute('role', 'button');
                facade.setAttribute('tabindex', '0');
                facade.setAttribute('aria-label', 'Reproduzir vídeo' + (frame.title ? ': ' + frame.title : ''));
                const thumb = info.kind === 'youtube' ? 'url("https://i.ytimg.com/vi/' + info.id + '/hqdefault.jpg") center/cover no-repeat, ' : '';
                facade.style.cssText = 'display:block;position:relative;box-sizing:border-box;width:' + width + 'px;max-width:100%;aspect-ratio:' + width + '/' + height + ';background:' + thumb + '#000;cursor:pointer;overflow:hidden;';
                const play = document.createElement('div');
                play.style.cssText = 'position:absolute;left:50%;top:50%;width:68px;height:48px;margin:-24px 0 0 -34px;border-radius:12px;background:rgba(20,20,20,.82);box-shadow:0 2px 10px #0008';
                const tri = document.createElement('div');
                tri.style.cssText = 'position:absolute;left:27px;top:14px;border-left:18px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent';
                play.append(tri);
                facade.append(play);

                records.set(frame, { facade, src, display: frame.style.display });
                bump('facades');
                frame.setAttribute('data-web-suite-facade', '');
                frame.setAttribute('src', 'about:blank');
                frame.style.setProperty('display', 'none', 'important');
                frame.before(facade);

                const start = event => {
                    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    const next = parseUrl(src);
                    next.searchParams.set('autoplay', '1');
                    restore(frame, next.href);
                };
                facade.addEventListener('click', start);
                facade.addEventListener('keydown', start);
                // Ao encostar o mouse, já aquece a conexão com o servidor do player.
                facade.addEventListener('pointerenter', () => {
                    linkTag('preconnect', info.kind === 'youtube' ? 'https://www.youtube.com' : 'https://player.vimeo.com', { crossOrigin: 'anonymous' });
                }, { once: true });
            }

            function restore(frame, href) {
                const record = records.get(frame);
                if (!record) return;
                records.delete(frame);
                frame.setAttribute('src', href || record.src);
                if (record.display) frame.style.display = record.display;
                else frame.style.removeProperty('display');
                frame.removeAttribute('data-web-suite-facade');
                record.facade.remove();
            }

            return {
                scan(root) {
                    each(root, 'iframe', build);
                },
                removed(root) {
                    each(root, 'iframe', frame => {
                        const record = records.get(frame);
                        if (record) {
                            record.facade.remove();
                            records.delete(frame);
                        }
                    });
                },
                stop() {
                    for (const frame of [...records.keys()]) restore(frame);
                },
            };
        },

        /* Pausa mídia que começa sozinha: sem nenhuma ativação do usuário na página e fora das exceções. */
        stopautoplay() {
            if (matchesHost(location.hostname, AUTOPLAY_ALLOW)) return { stop() {} };
            const paused = new WeakSet();

            const onPlay = event => {
                const media = event.target;
                if (!(media instanceof HTMLMediaElement)) return;
                if (navigator.userActivation?.hasBeenActive) return;
                if (protectedVideo(media) || media.dataset.webSuiteKeepPlaying !== undefined) return;
                media.pause();
                paused.add(media);
                bump('autoplayStopped');
            };

            document.addEventListener('play', onPlay, true);
            return { stop() { document.removeEventListener('play', onPlay, true); } };
        },

        /* Modo leve: imagens muito longe da tela viram um espaço em branco do mesmo tamanho. */
        litemode() {
            if (typeof IntersectionObserver === 'undefined') return { stop() {} };

            const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
            const saved = new Map();        // img -> dados originais (só enquanto descarregada)
            const watched = new WeakSet();
            let imageCount = 0;

            function unload(img) {
                if (saved.has(img) || !img.complete || img.naturalWidth < 40) return;
                const src = img.currentSrc || img.src;
                if (!src || src.startsWith('data:') || img.hasAttribute('data-web-suite-skip')) return;
                const box = img.getBoundingClientRect();
                if (box.width < 40 || box.height < 40) return;

                const picture = img.parentElement?.tagName === 'PICTURE' ? [...img.parentElement.querySelectorAll('source')] : [];
                saved.set(img, {
                    src: img.getAttribute('src'),
                    srcset: img.getAttribute('srcset'),
                    sizes: img.getAttribute('sizes'),
                    style: img.getAttribute('style'),
                    sources: picture.map(s => [s, s.getAttribute('srcset')]),
                });
                // mantém o espaço: sem isso a página pularia ao trocar pela imagem de 1 pixel
                img.style.setProperty('width', box.width + 'px', 'important');
                img.style.setProperty('height', box.height + 'px', 'important');
                img.removeAttribute('srcset');
                picture.forEach(s => s.removeAttribute('srcset'));
                img.setAttribute('src', BLANK);
                img.setAttribute('data-web-suite-lite', '');
                bump('imagesUnloaded');
            }

            function load(img) {
                const data = saved.get(img);
                if (!data) return;
                saved.delete(img);
                if (data.style === null) img.removeAttribute('style');
                else img.setAttribute('style', data.style);
                data.sources.forEach(([s, value]) => { if (value !== null) s.setAttribute('srcset', value); });
                if (data.srcset !== null) img.setAttribute('srcset', data.srcset);
                if (data.sizes !== null) img.setAttribute('sizes', data.sizes);
                if (data.src === null) img.removeAttribute('src');
                else img.setAttribute('src', data.src);
                img.removeAttribute('data-web-suite-lite');
            }

            const io = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    if (entry.isIntersecting) load(entry.target);
                    else unload(entry.target);
                }
            }, { rootMargin: '300% 0px 300% 0px' });

            return {
                scan(root) {
                    // só compensa em páginas com muitas imagens
                    imageCount = Math.max(imageCount, document.images.length);
                    if (imageCount < 80) return;
                    each(root, 'img', img => {
                        if (!watched.has(img)) {
                            watched.add(img);
                            io.observe(img);
                        }
                    });
                    if (root === document) each(document, 'img', img => {
                        if (!watched.has(img)) {
                            watched.add(img);
                            io.observe(img);
                        }
                    });
                },
                removed(root) {
                    each(root, 'img', img => {
                        io.unobserve(img);
                        saved.delete(img);
                    });
                },
                stop() {
                    io.disconnect();
                    for (const img of [...saved.keys()]) load(img);
                },
            };
        },

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
                    bump('preconnected');
                });
            };

            const timer = setTimeout(run, 1500);
            return { stop() { clearTimeout(timer); added.forEach(el => el.remove()); } };
        },

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
            const down = () => notify('Sem conexão com a internet');
            const up = () => notify('Conexão restabelecida');

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

        dark() {
            const t = PAGE_THEMES[config.pageTheme] || PAGE_THEMES.dark;
            return styleModule(`
            html,body { background-color:${t.bg}!important; color:${t.text}!important; color-scheme:${t.scheme}!important }
            main,article,section,header,footer,nav,aside,dialog { background-color:${t.panel}!important; color:${t.text}!important }
            p,li,label,h1,h2,h3,h4,h5,h6 { color:${t.text}!important }
            a { color:${t.link}!important }
            a:visited { color:${t.visited}!important }
            table,th,td,pre,code,kbd,samp,blockquote { background-color:${t.code}!important; color:${t.text}!important; border-color:${t.border}!important }
            input,textarea,select,button { color-scheme:${t.scheme} }
        `);
        },

        effects: () => styleModule(`
            * { backdrop-filter:none!important; -webkit-backdrop-filter:none!important }
            html,body { scroll-behavior:auto!important }
        `),

        feed() {
            const host = location.hostname;
            const selector = matchesHost(host, ['youtube.com'])
                ? 'ytd-rich-item-renderer'
                // X/Twitter fica de fora: a timeline já é virtualizada pelo próprio site e o
                // content-visibility fazia as imagens piscarem ao rolar.
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
            const host = location.hostname;
            const url = matchesHost(host, ['youtube.com'])
                ? 'https://i.ytimg.com'
                : matchesHost(host, ['twitch.tv'])
                    ? 'https://static-cdn.jtvnw.net'
                    : matchesHost(host, ['crunchyroll.com'])
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

        /* Botão sobre as imagens: abre a imagem grande numa camada, sem outra aba. */
        lightbox() {
            if (!window.matchMedia?.('(hover: hover)').matches) return { stop() {} };

            // Tudo por CSSOM (style.cssText) e createElement: funciona com CSP e Trusted Types estritos.
            const host = document.createElement('div');
            host.dataset.webSuiteLightbox = '';
            host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important';
            const root = host.attachShadow({ mode: 'open' });

            const mk = (tag, css, text = '') => {
                const el = document.createElement(tag);
                el.style.cssText = css;
                if (text) el.textContent = text;
                return el;
            };

            const button = mk('button', 'position:fixed;display:none;width:34px;height:34px;padding:0;border-radius:9px;border:1px solid rgba(255,255,255,.4);background:rgba(18,18,18,.85);color:#fff;font:700 18px/1 system-ui,sans-serif;cursor:pointer;pointer-events:auto;box-shadow:0 2px 10px rgba(0,0,0,.5)', '⤢');
            button.type = 'button';
            button.title = 'Ampliar imagem';
            button.setAttribute('aria-label', 'Ampliar imagem');

            const overlay = mk('div', 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.9);pointer-events:auto;overflow:hidden');
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', 'Imagem ampliada');
            const pic = mk('img', 'position:absolute;left:50%;top:50%;max-width:none;max-height:none;cursor:zoom-in;user-select:none;-webkit-user-drag:none;border-radius:3px;box-shadow:0 8px 40px rgba(0,0,0,.7);will-change:transform');
            pic.alt = '';
            pic.draggable = false;
            const close = mk('button', 'position:absolute;top:14px;right:16px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(30,30,30,.9);color:#fff;font:20px/1 system-ui,sans-serif;cursor:pointer', '×');
            close.type = 'button';
            close.setAttribute('aria-label', 'Fechar');
            const info = mk('div', 'position:absolute;left:0;right:0;bottom:12px;text-align:center;color:#ddd;font:12px system-ui,sans-serif;text-shadow:0 1px 3px #000');
            overlay.append(pic, close, info);
            root.append(button, overlay);
            (document.body || document.documentElement).append(host);

            const MIN = 120;
            const IMG_URL = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:$|[?#])/i;
            let current = null;
            let hideTimer = 0;
            let zoomed = false;
            let opener = null;
            const isOpen = () => overlay.style.display !== 'none';

            const hideButton = () => { button.style.display = 'none'; current = null; };
            const scheduleHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hideButton, 450); };

            const VIDEO_LINK = /\/(?:watch|shorts|reel|reels|video|videos|clip|clips|tv)(?:\/|\?|$)|[?&]v=/i;
            function imageAt(event) {
                const t = event.target;
                if (!(t instanceof Element) || host.contains(t)) return null;
                // Nada de botão sobre vídeos, players, miniaturas de vídeo ou posters.
                if (document.elementsFromPoint(event.clientX, event.clientY).some(el => el.localName === 'video' || el.localName === 'canvas' || el.closest?.('.html5-video-player,[data-testid="videoPlayer"],[data-testid="videoComponent"]'))) return null;
                const img = t instanceof HTMLImageElement ? t : t.querySelector?.('img');
                if (!img || img.hasAttribute('data-web-suite-lite')) return null;
                const holder = img.closest('a[href]');
                if (holder && VIDEO_LINK.test(holder.href) && !IMG_URL.test(holder.href)) return null;
                const box = img.getBoundingClientRect();
                // Poster/capa de player: um <video> de um contêiner próximo cobre boa parte da imagem.
                for (let el = img.parentElement, i = 0; el && i < 4; el = el.parentElement, i++) {
                    for (const video of el.querySelectorAll('video')) {
                        const r = video.getBoundingClientRect();
                        const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
                        const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
                        if (w > 0 && h > 0 && w * h > box.width * box.height * 0.4) return null;
                    }
                }
                const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
                return inside && box.width >= MIN && box.height >= MIN && (img.currentSrc || img.src) ? img : null;
            }

            function onOver(event) {
                if (isOpen()) return;
                const img = imageAt(event);
                if (!img) return;
                clearTimeout(hideTimer);
                if (img === current) return;
                current = img;
                const box = img.getBoundingClientRect();
                button.style.left = Math.max(4, Math.min(box.right, innerWidth) - 42) + 'px';
                button.style.top = Math.max(4, box.top + 8) + 'px';
                button.style.display = 'block';
            }

            function onOut(event) {
                if (!current || isOpen()) return;
                if (event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
                scheduleHide();
            }

            function absolute(url) {
                try { return new URL(url, document.baseURI).href; } catch { return url; }
            }

            // Maior versão provável: link direto, srcset (w ou x), ajuste de CDNs conhecidas, senão a própria.
            function bestSource(img) {
                const link = img.closest?.('a[href]');
                if (link && IMG_URL.test(link.href)) return link.href;
                let best = '';
                let score = 0;
                for (const part of (img.getAttribute('srcset') || '').split(',')) {
                    const [url, size = ''] = part.trim().split(/\s+/);
                    const n = parseFloat(size) || 0;
                    const value = /x$/i.test(size) ? n * 1000 : n;
                    if (url && value > score) {
                        score = value;
                        best = url;
                    }
                }
                let url = absolute(best || img.currentSrc || img.src);
                try {
                    const u = new URL(url);
                    if (/(^|\.)twimg\.com$/.test(u.hostname) && u.searchParams.has('name')) {
                        u.searchParams.set('name', 'orig');
                        url = u.href;
                    }
                } catch { /* mantém */ }
                return url;
            }

            // Ajuste ao ecrã (até 4x o tamanho natural) e zoom por roda, arrasto e clique.
            let scale = 1, fit = 1, tx = 0, ty = 0;
            const paint = () => { pic.style.transform = `translate(-50%,-50%) translate(${tx}px,${ty}px) scale(${scale})`; };
            const clampPan = () => {
                const w = pic.naturalWidth * scale, h = pic.naturalHeight * scale;
                const mx = Math.max(0, (w - innerWidth) / 2), my = Math.max(0, (h - innerHeight) / 2);
                tx = Math.max(-mx, Math.min(mx, tx));
                ty = Math.max(-my, Math.min(my, ty));
            };
            const hint = () => {
                info.textContent = `${pic.naturalWidth} × ${pic.naturalHeight}px · ${Math.round(scale * 100)}% · roda ou clique para aproximar · arraste para mover · Esc fecha`;
            };
            function fitToScreen() {
                const w = pic.naturalWidth || 1, h = pic.naturalHeight || 1;
                fit = Math.min((innerWidth * 0.96) / w, (innerHeight * 0.92) / h, 4);
                scale = fit; tx = 0; ty = 0;
                pic.style.width = w + 'px';
                pic.style.height = h + 'px';
                paint();
                pic.style.cursor = 'zoom-in';
                hint();
            }
            function zoomAt(next, cx, cy) {
                next = Math.max(fit, Math.min(next, Math.max(fit * 8, 8)));
                const k = next / scale;
                const dx = cx - innerWidth / 2, dy = cy - innerHeight / 2;
                tx = dx - (dx - tx) * k;
                ty = dy - (dy - ty) * k;
                scale = next;
                if (scale <= fit * 1.001) { tx = 0; ty = 0; } else clampPan();
                paint();
                pic.style.cursor = scale > fit * 1.001 ? 'grab' : 'zoom-in';
                hint();
            }

            function open(img) {
                const fallback = img.currentSrc || img.src;
                pic.onerror = () => { pic.onerror = null; if (pic.src !== fallback) pic.src = fallback; };
                pic.onload = () => {
                    // A versão "maior" veio menor que a da página? Fica com a da página.
                    if (pic.src !== fallback && img.naturalWidth && pic.naturalWidth < img.naturalWidth) { pic.src = fallback; return; }
                    fitToScreen();
                    pic.style.visibility = 'visible';
                };
                info.textContent = 'Carregando…';
                pic.style.visibility = 'hidden';
                pic.src = bestSource(img);
                overlay.style.display = 'block';
                opener = document.activeElement;
                hideButton();
                close.focus({ preventScroll: true });
                bump('imagesEnlarged');
            }

            function shut() {
                if (!isOpen()) return;
                overlay.style.display = 'none';
                pic.removeAttribute('src');
                if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
            }

            function onKey(event) {
                if (!isOpen()) return;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    shut();
                } else if (event.key === 'Tab') {
                    event.preventDefault();
                    close.focus({ preventScroll: true });
                }
            }

            button.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            button.addEventListener('mouseleave', scheduleHide);
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (current) open(current);
            });
            close.addEventListener('click', shut);
            overlay.addEventListener('click', event => { if (event.target === overlay) shut(); });
            overlay.addEventListener('wheel', event => {
                event.preventDefault();
                if (pic.naturalWidth) zoomAt(scale * Math.exp(-event.deltaY * 0.0018), event.clientX, event.clientY);
            }, { passive: false });
            let drag = null;
            pic.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                drag = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
                pic.setPointerCapture(event.pointerId);
                event.preventDefault();
            });
            pic.addEventListener('pointermove', event => {
                if (!drag) return;
                const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
                if (drag.moved && scale > fit * 1.001) {
                    tx = drag.tx + dx; ty = drag.ty + dy;
                    clampPan(); paint();
                    pic.style.cursor = 'grabbing';
                }
            });
            pic.addEventListener('pointerup', event => {
                const was = drag;
                drag = null;
                event.stopPropagation();
                if (!was || was.moved) { pic.style.cursor = scale > fit * 1.001 ? 'grab' : 'zoom-in'; return; }
                // clique: alterna entre ajustado e aproximado (100% ou 2,5x o ajuste)
                if (scale > fit * 1.001) zoomAt(fit, event.clientX, event.clientY);
                else zoomAt(Math.max(1, fit * 2.5), event.clientX, event.clientY);
            });
            const onResize = () => { if (isOpen() && pic.naturalWidth) fitToScreen(); };
            window.addEventListener('resize', onResize, { passive: true });

            const onScroll = () => { if (current && !isOpen()) hideButton(); };
            window.addEventListener('mouseover', onOver, { capture: true, passive: true });
            window.addEventListener('mouseout', onOut, { capture: true, passive: true });
            window.addEventListener('scroll', onScroll, { capture: true, passive: true });
            window.addEventListener('keydown', onKey, true);

            return {
                stop() {
                    shut();
                    window.removeEventListener('mouseover', onOver, true);
                    window.removeEventListener('mouseout', onOut, true);
                    window.removeEventListener('scroll', onScroll, true);
                    window.removeEventListener('keydown', onKey, true);
                    window.removeEventListener('resize', onResize);
                    clearTimeout(hideTimer);
                    host.remove();
                },
            };
        },

        /* Imagens sem decoding explícito passam a decodificar fora da thread principal. */
        decoding() {
            const changes = attributes('decoding');
            return {
                ...changes,
                scan(root) {
                    each(root, 'img:not([decoding])', img => changes.set(img, 'decoding', 'async'));
                },
            };
        },

        /* Libera seleção e cópia: CSS + ouvintes em captura que cortam o cancelamento do site. */
        unlockcopy() {
            const style = styleModule('*,*::before,*::after{-webkit-user-select:text!important;user-select:text!important}');
            const types = ['copy', 'cut', 'selectstart', 'contextmenu', 'dragstart'];
            const handler = event => {
                const t = event.target;
                if (t instanceof Element && t.closest('input,textarea,[contenteditable=""],[contenteditable="true"]')) return;
                event.stopImmediatePropagation();
            };
            types.forEach(type => window.addEventListener(type, handler, true));
            return {
                stop() {
                    types.forEach(type => window.removeEventListener(type, handler, true));
                    style.stop();
                },
            };
        },

        /* Remove o ping de cliques e, no Google, os redirecionamentos /url?q=. */
        pings() {
            const changes = attributes('pings');
            const google = matchesHost(location.hostname, ['google.com']);
            return {
                ...changes,
                scan(root) {
                    each(root, 'a[ping]', a => changes.set(a, 'ping', null));
                    if (!google) return;
                    each(root, 'a[href^="/url?"],a[href*="google.com/url?"]', a => {
                        const u = parseUrl(a.getAttribute('href'));
                        const target = u?.searchParams.get('q') || u?.searchParams.get('url') || '';
                        if (/^https?:\/\//i.test(target)) changes.set(a, 'href', target);
                    });
                },
            };
        },

        /* O pedido de permissão em si é tratado no content/page.js (mundo da página). */
        notifs() {
            document.dispatchEvent(new CustomEvent('ws:notifs', { detail: 'on' }));
            return { stop: () => document.dispatchEvent(new CustomEvent('ws:notifs', { detail: 'off' })) };
        },

        shorts() {
            if (!matchesHost(location.hostname, ['youtube.com'])) return { stop() {} };
            const items = ['ytd-video-renderer', 'ytd-grid-video-renderer', 'ytd-rich-item-renderer', 'ytd-compact-video-renderer', 'yt-lockup-view-model'];
            return styleModule(`
                ytd-reel-shelf-renderer,
                ytd-rich-shelf-renderer[is-shorts],
                ytd-guide-entry-renderer:has(a[title="Shorts"]),
                ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
                ${items.map(i => i + ':has(a[href^="/shorts/"])').join(',')} { display:none!important }
            `);
        },

        consent: () => styleModule(`
            #onetrust-consent-sdk, #onetrust-banner-sdk, #CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay,
            #didomi-host, .didomi-popup-backdrop, #usercentrics-root, [id^="sp_message_container"], .qc-cmp2-container,
            .cc-window, .cc-banner, #cookie-banner, .cookie-banner, .cookie-consent, #cookieconsent,
            .smartbanner, #smartbanner, [class*="smart-banner"] { display:none!important }
            html.sp-message-open, body.sp-message-open, html.didomi-popup-open, body.didomi-popup-open,
            html.cookie-modal-open, body.cookie-modal-open { overflow:auto!important; position:static!important }
        `),

        /* Feeds (Instagram, TikTok, X): pausa o vídeo que saiu da tela. */
        feedvideo() {
            if (typeof IntersectionObserver === 'undefined' || !matchesHost(location.hostname, ['instagram.com', 'tiktok.com', 'x.com', 'twitter.com'])) return { stop() {} };

            const observed = new WeakSet();
            const io = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    const v = entry.target;
                    if (!entry.isIntersecting && !v.paused && !protectedVideo(v)) {
                        v.pause();
                        bump('feedPaused');
                    }
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
    };

    /* ------------------------------------------------------------------ *
     *  PONTE COM O MUNDO DA PÁGINA (pop-ups)
     * ------------------------------------------------------------------ */
    function pushPopupState(on) {
        const detail = JSON.stringify({ on, blocked: config.blockedHosts, allowed: config.allowedPopupHosts });
        document.dispatchEvent(new CustomEvent('ws:popups', { detail }));
    }

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

        for (const { id } of FEATURES) {
            // pop-ups não dependem do DOM; o resto espera o documento existir
            if (!enabled(id) || active.has(id) || (!domReady && id !== 'popups')) continue;
            try {
                active.set(id, factories[id]());
            } catch {
                log('Não foi possível iniciar ' + id);
            }
        }

        if (!enabled('popups') && loaded) pushPopupState(false);

        if (domReady) {
            scan(document);
            watch();
        }
    }

    function syncRoute() {
        const next = pageKey();
        if (next === key) return false;
        key = next;
        reconcile(true);
        return true;
    }

    // Links novos são tratados no clique, sem varrer todos os links.
    function onLink(event) {
        if (!loaded) return;
        if (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0) return;

        syncRoute();
        if (pageSettings().excluded || globalOff) return;

        const link = event.composedPath().find(el => el instanceof Element && el.matches('a[href],area[href]'));
        if (!link) return;

        const dest = parseUrl(link.getAttribute('href'));

        if (enabled('popups') && dest && matchesHost(dest.hostname, config.blockedHosts)) {
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
     *  DIAGNÓSTICO
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

        [...res].sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0)).slice(0, 5).forEach(r => {
            if (!r.transferSize) return;
            let name = r.name;
            try {
                const u = new URL(r.name);
                name = u.host + u.pathname.slice(-28);
            } catch { /* usa o nome inteiro */ }
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
     *  MENSAGENS DO POPUP
     * ------------------------------------------------------------------ */
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'WS_STATE') return false;

        const features = {};
        for (const { id } of FEATURES) {
            features[id] = { allowed: allowed(id), enabled: enabled(id), active: active.has(id) };
        }

        sendResponse({
            key,
            profile: profile ? profile.note : null,
            slow,
            globalOff,
            excluded: pageSettings().excluded,
            overrides: pageSettings().overrides,
            hostOverrides: hostOverrides(),
            host: location.hostname,
            features,
            vitals: { ...vitalsState },
            diagnostics: message.diagnostics ? diagnostics() : undefined,
        });
        return false;
    });

    /* ------------------------------------------------------------------ *
     *  STORAGE
     * ------------------------------------------------------------------ */
    function applyStore(values) {
        defaultsStore = values[STORE.defaults] && typeof values[STORE.defaults] === 'object' ? values[STORE.defaults] : {};
        pagesStore = values[STORE.pages] && typeof values[STORE.pages] === 'object' ? values[STORE.pages] : {};
        hostsStore = values[STORE.hosts] && typeof values[STORE.hosts] === 'object' ? values[STORE.hosts] : {};
        const c = values[STORE.config] || {};
        const before = config.pageTheme;
        config = {
            blockedHosts: Array.isArray(c.blockedHosts) ? c.blockedHosts : [],
            allowedPopupHosts: Array.isArray(c.allowedPopupHosts) ? c.allowedPopupHosts : [],
            pageTheme: PAGE_THEMES[c.pageTheme] ? c.pageTheme : 'dark',
        };
        // Trocou o tema das páginas: o módulo é refeito no próximo reconcile.
        if (before !== config.pageTheme && active.has('dark')) {
            try {
                active.get('dark').stop();
            } catch { /* já removido */ }
            active.delete('dark');
        }
        globalOff = values[STORE.off] === true;
    }

    chrome.storage.local.get(Object.values(STORE)).then(values => {
        applyStore(values);
        loaded = true;
        reconcile();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !loaded) return;
        const next = {};
        for (const k of Object.values(STORE)) {
            next[k] = changes[k] ? changes[k].newValue : { [STORE.defaults]: defaultsStore, [STORE.pages]: pagesStore, [STORE.hosts]: hostsStore, [STORE.config]: config, [STORE.off]: globalOff }[k];
        }
        applyStore(next);
        reconcile();
    });

    /* ------------------------------------------------------------------ *
     *  CORE WEB VITALS (leitura passiva) E MEMÓRIA JAVASCRIPT DA ABA
     * ------------------------------------------------------------------ */
    const vitalsState = { lcp: null, cls: 0, inp: null, fcp: null };

    (function observeVitals() {
        const watch = (type, callback, options = {}) => {
            try {
                new PerformanceObserver(list => list.getEntries().forEach(callback)).observe({ type, buffered: true, ...options });
            } catch { /* tipo sem suporte */ }
        };

        watch('largest-contentful-paint', e => { vitalsState.lcp = e.startTime; });
        watch('paint', e => { if (e.name === 'first-contentful-paint') vitalsState.fcp = e.startTime; });

        // CLS: janelas de sessão (intervalo < 1 s entre deslocamentos, no máximo 5 s por janela)
        let windowValue = 0;
        let windowStart = 0;
        let lastShift = 0;
        watch('layout-shift', e => {
            if (e.hadRecentInput) return;
            if (windowValue && (e.startTime - lastShift > 1000 || e.startTime - windowStart > 5000)) windowValue = 0;
            if (!windowValue) windowStart = e.startTime;
            lastShift = e.startTime;
            windowValue += e.value;
            vitalsState.cls = Math.max(vitalsState.cls, windowValue);
        });

        // INP: com poucas interações é a pior; com muitas, descarta a pior a cada 50
        const interactions = new Map();
        watch('event', e => {
            if (!e.interactionId) return;
            if (e.duration > (interactions.get(e.interactionId) || 0)) interactions.set(e.interactionId, e.duration);
            const sorted = [...interactions.values()].sort((a, b) => b - a);
            vitalsState.inp = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))];
        }, { durationThreshold: 40 });
    })();

    function reportHeap() {
        const memory = performance.memory;
        if (!memory || !loaded || globalOff) return;
        try {
            chrome.runtime.sendMessage({ type: 'WS_HEAP', used: memory.usedJSHeapSize, host: location.hostname, title: document.title.slice(0, 80) }).catch(() => undefined);
        } catch { /* extensão recarregada */ }
    }
    setInterval(reportHeap, 60000);
    setTimeout(reportHeap, 6000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reportHeap(); });

    /* ------------------------------------------------------------------ *
     *  MODO SEGURO: se a página começa a errar logo depois de otimizada, oferece desligar tudo aqui
     * ------------------------------------------------------------------ */
    const MUTATING = ['images', 'iframes', 'facades', 'preload', 'autoplay', 'banners', 'sidebars', 'dark', 'effects', 'motion', 'feed', 'offscreen', 'pings', 'shorts', 'consent', 'feedvideo', 'decoding', 'unlockcopy', 'lightbox'];
    let errorCount = 0;
    let safeShown = false;
    const startedAt = performance.now();
    const ignoreKey = 'ws-safe-ignore:' + location.hostname;

    function safeModeToast() {
        if (safeShown) return;
        try {
            if (sessionStorage.getItem(ignoreKey)) return;
        } catch { /* sem acesso */ }
        safeShown = true;

        const host = document.createElement('div');
        host.dataset.webSuiteSafe = '';
        host.style.cssText = 'position:fixed!important;left:50%!important;bottom:20px!important;transform:translateX(-50%)!important;z-index:2147483647!important;';
        const root = host.attachShadow({ mode: 'open' });
        const box = document.createElement('div');
        box.setAttribute('role', 'alert');
        box.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:min(560px,92vw);padding:10px 14px;background:#171319;border:1px solid #954256;border-radius:14px;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 4px 18px #0007';
        const text = document.createElement('span');
        text.textContent = 'Esta página começou a dar erros. Se algo quebrou, desligue as otimizações aqui.';
        const make = (label, primary, fn) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'padding:6px 10px;border-radius:8px;border:1px solid ' + (primary ? '#ef5473' : '#70505a') + ';background:' + (primary ? '#ae1535' : '#34222a') + ';color:#fff;font:inherit;cursor:pointer';
            b.addEventListener('click', fn);
            return b;
        };
        const off = make('Desligar aqui e recarregar', true, async () => {
            const { [STORE.pages]: pages } = await chrome.storage.local.get(STORE.pages);
            await chrome.storage.local.set({ [STORE.pages]: { ...(pages || {}), [key]: { excluded: true, overrides: {} } } });
            location.reload();
        });
        const keep = make('Ignorar', false, () => {
            try {
                sessionStorage.setItem(ignoreKey, '1');
            } catch { /* sem acesso */ }
            host.remove();
        });
        box.append(text, off, keep);
        root.append(box);
        (document.body || document.documentElement).append(host);
    }

    function onPageError(event) {
        if (!loaded || globalOff || safeShown) return;
        if (performance.now() - startedAt > 12000) return;
        if (!event.filename && !event.reason) return;       // "Script error." de outra origem: sem informação
        errorCount += 1;
        if (errorCount >= 4 && MUTATING.some(id => active.has(id))) safeModeToast();
    }

    window.addEventListener('error', onPageError, true);
    window.addEventListener('unhandledrejection', onPageError, true);

    /* ------------------------------------------------------------------ *
     *  INÍCIO
     * ------------------------------------------------------------------ */
    function ready() {
        if (domReady) return;
        domReady = true;
        if (loaded) reconcile();

        // Navegação em SPAs: o Navigation API avisa sem polling; sem ele, 1,5 s.
        const recheck = () => {
            syncRoute();
            if (loaded && enabled('tracking')) {
                const cleaned = cleanUrl(location.href);
                if (cleaned !== location.href) {
                    try {
                        history.replaceState(history.state, '', cleaned);
                    } catch { /* URL protegida */ }
                }
            }
        };

        const nav = window.navigation;
        if (nav && typeof nav.addEventListener === 'function') nav.addEventListener('navigatesuccess', recheck);
        else setInterval(recheck, 1500);
    }

    window.addEventListener('popstate', syncRoute);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
})();
