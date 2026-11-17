/*
 * Roda no MUNDO DA PÁGINA (world: MAIN), antes do código do site. Só faz uma coisa:
 * o bloqueio de pop-ups, que precisa substituir window.open da própria página.
 * O estado (ligado, hosts bloqueados e liberados) chega do content/main.js por um evento
 * do documento; até chegar, o padrão é bloquear. Não roda na Crunchyroll (veja o manifesto).
 */
(() => {
    'use strict';

    if (window.__weboaPage) return;
    window.__weboaPage = true;

    let on = true;
    let blocked = [];
    let allowedHosts = [];

    document.addEventListener('ws:popups', event => {
        try {
            const state = JSON.parse(String(event.detail));
            on = state.on !== false;
            blocked = Array.isArray(state.blocked) ? state.blocked : [];
            allowedHosts = Array.isArray(state.allowed) ? state.allowed : [];
        } catch { /* mantém o estado anterior */ }
    }, true);

    // Logins "Entrar com Google/Apple/..." abrem uma janelinha: liberadas sempre que há um clique seu.
    const AUTH_HOSTS = [
        'accounts.google.com', 'appleid.apple.com', 'login.microsoftonline.com', 'login.live.com',
        'github.com', 'www.facebook.com', 'facebook.com', 'discord.com', 'id.twitch.tv',
        'api.twitter.com', 'twitter.com', 'x.com', 'accounts.spotify.com', 'steamcommunity.com',
        'login.yahoo.com', 'www.paypal.com', 'paypal.com', 'auth0.com', 'okta.com',
    ];

    const norm = x => String(x).trim().toLowerCase().replace(/\.+$/, '');
    const matches = (host, list) => list.some(value => {
        const entry = norm(value);
        const h = norm(host);
        return entry && (h === entry || h.endsWith('.' + entry));
    });

    const parse = value => {
        try {
            return new URL(value, document.baseURI);
        } catch {
            return null;
        }
    };

    const original = window.open;

    function wrapped(url = '', target = '_blank', ...rest) {
        if (!on) return Reflect.apply(original, window, [url, target, ...rest]);

        const raw = String(url);
        const dest = parse(raw);
        const name = String(target);

        if (!dest || !['http:', 'https:', 'about:'].includes(dest.protocol) || matches(dest.hostname, blocked)) {
            return null;
        }

        const existing = ['_self', '_parent', '_top'].includes(name.toLowerCase());
        const allowed = ['http:', 'https:'].includes(dest.protocol)
            && (matches(dest.hostname, allowedHosts) || matches(dest.hostname, AUTH_HOSTS))
            && window.navigator.userActivation?.isActive === true;

        if (!existing && !allowed) return null;

        return Reflect.apply(original, window, [raw, name, ...rest]);
    }

    window.open = wrapped;

    // Não pedir permissão de notificações: o pedido responde "default" sem abrir o diálogo.
    let notifsOff = false;
    document.addEventListener('ws:notifs', event => {
        notifsOff = event.detail === 'on';
    }, true);

    try {
        const N = window.Notification;
        const request = N && N.requestPermission;
        if (typeof request === 'function') {
            N.requestPermission = function (callback) {
                if (!notifsOff || N.permission !== 'default') return Reflect.apply(request, N, [callback]);
                if (typeof callback === 'function') {
                    try {
                        callback('default');
                    } catch { /* erro do site */ }
                }
                return Promise.resolve('default');
            };
        }
    } catch { /* Notification indisponível */ }
})();
