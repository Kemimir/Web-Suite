/*
 * Lista de funções e perfis do WEBoa. Carregada antes do script de conteúdo e do popup,
 * então as duas pontas enxergam exatamente a mesma lista.
 */
(function (root) {
    'use strict';

    // [id, nome, padrão, descrição, grupo]
    const FEATURES = [
        // Conexão
        ['prefetch', 'Pré-carregar a próxima página (regras de especulação)', true, 'O Chrome busca a página do link quando o mouse repousa ~200 ms sobre ele (ou no clique) e a guarda em memória. Ignora sair/excluir/comprar/baixar. Desligado em rede lenta ou Save-Data.', 'Conexão'],
        ['prerender', 'Pré-renderizar a próxima página', false, 'Vai além do pré-carregamento: a página é desenhada em segundo plano e abre na hora. Gasta mais memória e pode registrar visitas que você não fez; use em sites de confiança.', 'Conexão'],
        ['thirdparty', 'Preparar conexões de terceiros', true, 'Depois do carregamento, faz preconnect às 3 origens externas mais usadas pela página (CDN, fontes, mídia). Sem baixar nada além do aperto de mão.', 'Conexão'],
        ['adaptive', 'Modo econômico em conexão lenta', true, 'Com Save-Data ou rede 2G/3G, liga sozinho lazy de imagens/iframes e reduz o pré-carregamento de vídeo (a menos que você tenha decidido o contrário na página).', 'Conexão'],
        ['retry', 'Recarregar imagens que falharam', true, 'Quando a internet volta, tenta de novo as imagens que não carregaram (no máximo 30 por vez).', 'Conexão'],
        ['offline', 'Aviso de conexão', true, 'Mostra um aviso discreto quando a internet cai e quando volta.', 'Conexão'],
        ['connect', 'Preparar conexões de mídia conhecidas', false, 'No máximo uma conexão conhecida por site (YouTube, Twitch, Crunchyroll). Sem prefetch de vídeos.', 'Conexão'],
        // Privacidade
        ['popups', 'Bloquear pop-ups via window.open', true, 'Bloqueia novas janelas; links normais continuam funcionando. Logins (Google, Apple, Microsoft, GitHub, Facebook, X, Discord…) abrem normalmente quando você clica; outras exceções nos Padrões.', 'Privacidade'],
        ['pings', 'Remover rastreio de cliques em links', true, 'Tira o atributo ping dos links (o navegador avisa o site de cada clique) e, no Google, troca os links de redirecionamento /url?q= pelo endereço direto.', 'Privacidade'],
        ['notifs', 'Não pedir permissão de notificações', false, 'Impede que o site abra o pedido "Permitir notificações". Se você já permitiu antes, nada muda.', 'Privacidade'],
        ['tracking', 'Limpar parâmetros de rastreamento', true, 'Remove utm_*, fbclid e similares. Preserva parâmetros funcionais e URLs assinadas.', 'Privacidade'],
        // Desempenho
        ['images', 'Otimizar imagens fora da tela', true, 'Lazy loading abaixo da tela; respeita imagens prioritárias e opções explícitas do site.', 'Desempenho'],
        ['decoding', 'Decodificar imagens fora da thread principal', true, 'Marca as imagens sem opção própria com decoding=async: o navegador decodifica sem travar a rolagem e a digitação. Não muda o visual.', 'Desempenho'],
        ['iframes', 'Adiar iframes fora da tela', true, 'Aplica lazy loading somente a iframes distantes e sem opção explícita.', 'Desempenho'],
        ['facades', 'Fachadas para vídeos (YouTube e Vimeo)', true, 'Troca o player embutido por uma miniatura com play; o player só carrega no clique (economiza ~500 KB por vídeo). Não mexe em players controlados pelo site (API).', 'Desempenho'],
        ['litemode', 'Modo leve de imagens (experimental)', false, 'Em páginas com muitas imagens, troca por um espaço em branco as imagens que ficaram a mais de ~3 telas de distância e as devolve antes de você chegar lá. Mantém o tamanho para a página não pular. Pode piscar ao rolar rápido.', 'Desempenho'],
        ['feed', 'Renderização leve de feeds', false, 'Somente cartões do YouTube e X/Twitter. Nunca o player ou todas as listas.', 'Desempenho'],
        ['motion', 'Reduzir animações', false, 'Encurta animações e transições CSS a quase zero. Menos trabalho de pintura em páginas pesadas.', 'Desempenho'],
        ['effects', 'Reduzir transparência e scroll suave', false, 'Remove backdrop-filter e rolagem suave; pode mudar o visual.', 'Desempenho'],
        // Mídia
        ['offscreen', 'Pausar vídeos silenciosos fora da tela', false, 'Pausa apenas vídeos mudos. Preserva Picture-in-Picture e tela cheia.', 'Mídia'],
        ['hidden', 'Pausar vídeos ao ocultar a aba', false, 'Pode interromper música e transmissões em segundo plano. Não retoma automaticamente.', 'Mídia'],
        ['preload', 'Reduzir pré-carregamento de vídeos', false, 'Sugere metadata somente quando o site não especifica preload.', 'Mídia'],
        ['autoplay', 'Remover autoplay declarado', false, 'Remove o atributo autoplay; não impede play() chamado pelo site.', 'Mídia'],
        ['feedvideo', 'Pausar vídeo de feed que sai da tela', false, 'Só no Instagram, TikTok e X: pausa o vídeo (com ou sem som) quando ele sai da tela. Não retoma sozinho. Preserva Picture-in-Picture e tela cheia.', 'Mídia'],
        ['stopautoplay', 'Pausar vídeos que começam sozinhos', false, 'Pausa vídeos e áudios que começam a tocar sem nenhum clique seu na página (previews, fundos animados). Depois que você clica ou toca na página, tudo volta ao normal. Streaming e videoconferência são exceções.', 'Mídia'],
        // Aparência
        ['dark', 'Tema das páginas', false, 'Escuro, AMOLED, sépia ou alto contraste (escolha em Padrões). Tema por CSS, sem inverter imagens; pode disputar com o tema do próprio site.', 'Aparência'],
        ['shorts', 'Ocultar Shorts do YouTube', false, 'Esconde as prateleiras e os vídeos do tipo Shorts nas listas do YouTube.', 'Aparência'],
        ['consent', 'Ocultar cookies e "abrir no app"', false, 'Esconde faixas de cookies e de "baixe o app" de plataformas conhecidas (OneTrust, Cookiebot, Didomi, Quantcast…). Não aceita nem recusa nada por você.', 'Aparência'],
        ['lightbox', 'Ampliar imagens sem abrir outra aba', true, 'Ao passar o mouse sobre uma imagem grande aparece um botão ⤢; ao clicar, a imagem abre ampliada numa camada (clique para aproximar, Esc ou clique fora para fechar). Só em dispositivos com mouse.', 'Aparência'],
        ['unlockcopy', 'Liberar seleção, cópia e menu de contexto', false, 'Em sites que bloqueiam copiar texto ou o clique direito: força a seleção e impede o site de cancelar copiar, selecionar e o menu. Pode atrapalhar apps com menu próprio; use só onde precisar.', 'Aparência'],
        ['banners', 'Ocultar banners conhecidos', false, 'Oculta alguns banners de consentimento, newsletter e espaços de anúncios. Não decide consentimento.', 'Aparência'],
        ['sidebars', 'Ocultar barras laterais', false, 'Oculta aside e role=complementary. Pode esconder navegação útil.', 'Aparência'],
    ].map(([id, name, def, desc, group]) => ({ id, name, def, desc, group }));

    /**
     * Perfis por domínio. `only` = lista fechada de funções permitidas ali.
     * Na Crunchyroll a extensão BOAnimes já cuida de imagens (modo leve), player, tema e
     * rolagem, e observa a página do jeito dela. Aqui só ficam funções que não tocam no DOM
     * nem no player: reescrever o endereço (tracking), um preconnect (connect) e o aviso (offline).
     */
    const PROFILES = [
        {
            hosts: ['crunchyroll.com'],
            only: ['tracking', 'connect', 'offline'],
            note: 'Modo de convivência com a extensão BOAnimes',
        },
    ];

    // Apps que nunca são suspensos (perderiam estado ou precisam ficar vivos em segundo plano).
    const PROTECTED_APPS = [
        'docs.google.com', 'sheets.google.com', 'slides.google.com', 'drive.google.com', 'mail.google.com',
        'calendar.google.com', 'meet.google.com', 'figma.com', 'notion.so', 'slack.com', 'discord.com',
        'teams.microsoft.com', 'zoom.us', 'spotify.com', 'web.whatsapp.com', 'web.telegram.org',
        'chatgpt.com', 'claude.ai', 'github.dev', 'codesandbox.io', 'stackblitz.com', 'excalidraw.com',
        'miro.com', 'trello.com', 'linear.app', 'outlook.live.com', 'outlook.office.com',
    ];

    // Scripts de terceiros bloqueados pela rede. Lista curta e curada (nada de login ou pagamento).
    const BLOCK_CATEGORIES = {
        social: [
            'connect.facebook.net', 'staticxx.facebook.com', 'platform.twitter.com', 'platform.linkedin.com',
            'assets.pinterest.com', 'platform.instagram.com', 'sharethis.com', 'addthis.com',
        ],
        analytics: [
            'google-analytics.com', 'hotjar.com', 'cdn.segment.com', 'api.segment.io', 'cdn.mxpnl.com',
            'api.mixpanel.com', 'cdn.amplitude.com', 'api.amplitude.com', 'clarity.ms', 'fullstory.com',
            'js-agent.newrelic.com', 'bam.nr-data.net', 'static.cloudflareinsights.com', 'heapanalytics.com',
            'mouseflow.com', 'crazyegg.com', 'luckyorange.com',
        ],
        embeds: [
            'js.intercomcdn.com', 'widget.intercom.io', 'js.driftt.com', 'js.drift.com', 'embed.tawk.to',
            'client.crisp.chat', 'cdn.optimizely.com', 'dev.visualwebsiteoptimizer.com',
        ],
    };

    // Sites de streaming e chamadas: o autoplay deles é o conteúdo, nunca pausar.
    const AUTOPLAY_ALLOW = [
        'youtube.com', 'twitch.tv', 'netflix.com', 'primevideo.com', 'disneyplus.com', 'max.com', 'hbomax.com',
        'hulu.com', 'tv.apple.com', 'vimeo.com', 'spotify.com', 'soundcloud.com', 'meet.google.com', 'zoom.us',
        'teams.microsoft.com', 'discord.com', 'whatsapp.com', 'twitter.com', 'x.com',
    ];

    const ADAPTIVE_TARGETS = ['images', 'iframes', 'preload'];

    // Temas das páginas (função "dark") e do painel.
    const PAGE_THEMES = {
        dark: { name: 'Escuro', bg: '#121212', panel: '#191919', code: '#242424', text: '#eeeeee', link: '#8ab4f8', visited: '#c6a5f7', border: '#555555', scheme: 'dark' },
        amoled: { name: 'AMOLED (preto)', bg: '#000000', panel: '#000000', code: '#0d0d0d', text: '#e6e6e6', link: '#7db3ff', visited: '#c4a0f5', border: '#3a3a3a', scheme: 'dark' },
        sepia: { name: 'Sépia (leitura)', bg: '#f4ecd8', panel: '#efe4c8', code: '#e8dcc0', text: '#433422', link: '#7a4a1c', visited: '#6b3d6b', border: '#c9b88f', scheme: 'light' },
        contrast: { name: 'Alto contraste', bg: '#000000', panel: '#000000', code: '#000000', text: '#ffffff', link: '#ffff66', visited: '#ff9cff', border: '#ffffff', scheme: 'dark' },
    };
    // Partes do tema das páginas, cada uma com a sua chave liga/desliga (ws_config.themeParts).
    const THEME_PARTS = [
        ['scheme', 'Modo escuro do navegador', 'Avisa o site e o navegador de que a página é escura: barras de rolagem, menus e campos nativos.', true],
        ['background', 'Fundos', 'Fundo da página e de seções, cabeçalhos, rodapés, menus laterais e janelas.', true],
        ['text', 'Texto', 'Cor de parágrafos, listas e títulos.', true],
        ['links', 'Links', 'Cor dos links e dos já visitados.', true],
        ['tables', 'Tabelas e código', 'Fundo e borda de tabelas, trechos de código e citações.', true],
        ['forms', 'Campos de formulário', 'Cor de caixas de texto, áreas de texto e listas de seleção.', true],
        ['scrollbars', 'Barras de rolagem', 'Barra de rolagem na cor do tema.', true],
        ['selection', 'Seleção de texto', 'Cor do texto marcado com o mouse.', true],
        ['dim', 'Escurecer imagens', 'Reduz um pouco o brilho das imagens para não ofuscar (não mexe em vídeos).', false],
        ['sites', 'Correções por site', 'Ajustes conhecidos de sites que misturam o tema próprio com o seu (hoje: faixa cinza da resposta por IA do Google).', true],
    ];
    const themePartsOf = raw => {
        const out = {};
        for (const [id, , , def] of THEME_PARTS) out[id] = raw && typeof raw[id] === 'boolean' ? raw[id] : def;
        return out;
    };
    const PANEL_THEMES = { orange: 'RedRat (padrão)', amber: 'Laranja', graphite: 'Grafite', light: 'Claro', blue: 'Azul', purple: 'Roxo' };

    const normalizeHost = x => String(x).trim().toLowerCase().replace(/\.+$/, '');
    const matchesHost = (host, list) => list.some(value => {
        const entry = normalizeHost(value);
        const h = normalizeHost(host);
        return entry && (h === entry || h.endsWith('.' + entry));
    });

    const profileFor = host => PROFILES.find(p => matchesHost(host, p.hosts)) || null;
    const pageKeyOf = url => {
        try {
            const u = new URL(url);
            return u.origin + u.pathname;
        } catch {
            return '';
        }
    };

    root.WS = { FEATURES, PROFILES, AUTOPLAY_ALLOW, PROTECTED_APPS, BLOCK_CATEGORIES, ADAPTIVE_TARGETS, PAGE_THEMES, PANEL_THEMES, THEME_PARTS, themePartsOf, matchesHost, profileFor, pageKeyOf, normalizeHost };
})(typeof self !== 'undefined' ? self : this);
