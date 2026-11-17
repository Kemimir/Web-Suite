# WEBoa — By Kemir (extensão para Chrome, Brave e Edge)

Conexão, desempenho e privacidade para qualquer site. É a versão em extensão do script WEBoa 4 (que ficou em `..\legado`).

## Instalar
1. `brave://extensions` (ou `chrome://extensions`) → ative o **Modo do desenvolvedor**.
2. **Carregar sem compactação** → escolha **esta pasta** (`extensao`, a que tem o `manifest.json`).
3. Clique no ícone do raio laranja para abrir o painel. Desative o script antigo no Tampermonkey: as duas formas não devem rodar juntas.

## O que tem no painel
- **Esta página**: liga/desliga cada função só nesta página (domínio + caminho, sem `?parâmetros`), exclui a página inteira ou restaura os padrões.
  No topo da aba há o bloco **"Excluir de uma função só"**: escolha a função e use **Desta página** ou **Do site inteiro** (o domínio, em todas as páginas). As exclusões aparecem como etiquetas ("Página" / "Site") com um × para remover. A ordem de decisão é: escolha da página > escolha do site > padrão.
- **Padrões**: valem para todas as páginas; também os hosts sempre bloqueados e os liberados para pop-up.
- **Diagnóstico**: DNS, conexão, TLS, 1º byte, DOM pronto, peso transferido, 5 maiores recursos, tarefas longas, memória JS e tipo de rede, com "Copiar relatório".
- **Chave geral** no topo: liga/desliga tudo, sem recarregar.

## Funções (32)
| Grupo | Funções |
|---|---|
| Conexão | **pré-carregar a próxima página (regras de especulação)**, **pré-renderizar a próxima página**, preconnect de terceiros, modo econômico em rede lenta, recarregar imagens que falharam, aviso de conexão, conexões de mídia conhecidas |
| Privacidade | bloquear pop-ups (`window.open`), **remover rastreio de cliques (`ping` e redirecionamento do Google)**, **não pedir permissão de notificações**, limpar `utm_*`/`fbclid` e similares |
| Desempenho | lazy de imagens e iframes, **fachadas para vídeos do YouTube/Vimeo**, feeds leves, reduzir animações, reduzir transparência e scroll suave |
| Mídia | pausar vídeos mudos fora da tela, **pausar vídeo de feed que sai da tela (Instagram, TikTok, X)**, pausar ao ocultar a aba, reduzir preload, remover autoplay, pausar vídeos que começam sozinhos |
| Aparência | **tema das páginas (escuro, AMOLED, sépia, alto contraste)**, **ocultar Shorts do YouTube**, **ocultar cookies e "abrir no app"**, ocultar banners conhecidos, ocultar barras laterais |

## Novidades da 1.5.0
- **Temas**: 5 temas para o painel (laranja, grafite, claro, azul, roxo) e 4 para as páginas (escuro, AMOLED, sépia, alto contraste), em Padrões.
- **Ampliar imagens**: ao passar o mouse sobre uma imagem de pelo menos 120 px aparece o botão ⤢; ele abre a imagem grande numa camada na própria página (clique para aproximar, Esc ou clique fora para fechar), usando a maior versão disponível (link direto para a imagem ou o maior item do `srcset`). Ligada por padrão; só com mouse; indisponível na Crunchyroll.
- **Atalho de teclado**: `Alt+Shift+W` exclui (ou volta a incluir) a página atual; muda em `chrome://extensions/shortcuts`.
- **Funções novas**: decodificar imagens sem travar a rolagem (ligada), liberar seleção/cópia/menu (desligada), remover rastreio de cliques, não pedir notificações, ocultar Shorts, ocultar cookies/"abrir no app" e pausar vídeo de feed (Instagram, TikTok, X). Todas indisponíveis na Crunchyroll.
- **Exportar/importar** configurações (Padrões → Backup). O arquivo é validado ao importar.
- **Termos de uso e privacidade** (`TERMS.md`, `PRIVACY.md`) com links no rodapé do painel.

## Correção (1.4.0)
- **X/Twitter**: "feeds leves" não mexe mais na timeline do X (o `content-visibility` fazia as imagens piscarem ao rolar). Continua valendo no YouTube.

## Novidades da 1.4.0
- **Vitais da página** (aba Diagnóstico): LCP, FCP, CLS e INP em tempo real, com a classificação do Google (bom, regular, ruim). Leitura passiva, funciona em qualquer página, inclusive na Crunchyroll. O INP só aparece depois que você interage com a página.
- **Abas mais pesadas** (aba Diagnóstico): cada aba informa a memória JavaScript a cada minuto, e o popup lista as 8 maiores com um botão **Suspender**. É só uma parte da memória real da aba (imagens e vídeo ficam de fora): serve para comparar abas entre si.
- **Pausar vídeos que começam sozinhos** (grupo Mídia, desligado por padrão): pausa vídeo e áudio que começam sem nenhuma ativação sua na página. Depois do primeiro clique ou toque, tudo funciona normal. Streaming e chamadas (YouTube, Twitch, Netflix, Prime Video, Spotify, Meet, Zoom, Discord…) são exceção. Um elemento com `data-weboa-keep-playing` nunca é pausado.
- **Modo leve de imagens (experimental)** (grupo Desempenho, desligado por padrão): em páginas com 80 ou mais imagens, troca por um espaço em branco do mesmo tamanho as que ficaram a mais de ~3 telas, e devolve antes de você chegar. Não ativa em páginas pequenas.
- Dois contadores novos na economia acumulada: vídeos pausados e imagens devolvidas.
- Não roda na Crunchyroll (perfil de convivência).

## Novidades da 1.3.0
- **Modo seguro**: se a página soltar 4 ou mais erros nos primeiros 12 segundos e alguma otimização estiver mexendo nela, aparece um aviso com **"Desligar aqui e recarregar"** (exclui a página) ou **"Ignorar"** (some até fechar a aba). No popup há também o botão **"Modo seguro: desligar tudo aqui"**.
- **Suspender abas inativas** (Padrões → liga e escolhe 10 min, 30 min, 1 h ou 3 h). Usa `chrome.tabs.discard`. Nunca suspende aba ativa, fixada, tocando áudio, com formulário que você começou a preencher, nem apps protegidos (Google Docs/Gmail, Figma, Notion, Slack, Discord, Teams, Zoom, Spotify, WhatsApp Web, ChatGPT, Claude e outros) nem os sites da sua lista. **Desligado por padrão.**
- **Scripts de terceiros** (Padrões → nível 0, 1 ou 2): bloqueio pela rede (`declarativeNetRequest`) de rastreadores e botões sociais (nível 1) e também chats e testes A/B (nível 2). Lista curta e curada, sem login nem pagamento, nunca na Crunchyroll. Dá para desligar por site ("Scripts de terceiros neste site"). O número de bloqueios aparece no ícone. **Nível 0 (desligado) por padrão.**
- **Economia acumulada** (aba Diagnóstico): vídeos adiados com fachada (≈ 0,5 MB cada, estimativa), imagens e iframes adiados, páginas pré-carregadas, conexões preparadas e abas suspensas, com botão de zerar.
- Novas permissões: `tabs` (ler endereço e último uso das abas), `alarms` (varredura a cada minuto) e `declarativeNetRequest`.

## Novidades da 1.1.0
- **Regras de especulação**: o pré-carregamento passou a usar a API do Chrome (`<script type="speculationrules">`, regras de documento com `eagerness: moderate`, ~200 ms de hover). Exclui endereços com efeito colateral (sair, excluir, carrinho, pagamento, download) e links `target=_blank`/`download`. O pré-renderizar (desligado por padrão) usa a mesma regra com `prerender`.
  **No Brave a API não está disponível** (`HTMLScriptElement.supports('speculationrules')` deu falso nos testes), então lá a extensão usa o método antigo (`<link rel=prefetch>`), que também funciona. Se um CSP bloquear a regra inline, o mesmo recuo acontece sozinho.
- **Fachadas**: o iframe do YouTube/Vimeo vira uma miniatura com botão de play; o player só carrega no clique (com `autoplay=1`) e volta ao normal ao desligar a função. Players controlados por API (`enablejsapi=1`) não são tocados.
- O pré-carregamento fica desligado em rede lenta/Save-Data, e nada disso roda na Crunchyroll.

## Convivência com a extensão BOAnimes
Em `crunchyroll.com`:
- o bloqueio de pop-ups **nem é carregado** (o script de `window.open` é excluído do domínio no manifesto);
- só funcionam `tracking` (reescreve o endereço), `connect` (um preconnect) e `offline` (aviso). Imagens, iframes, vídeo, tema, banners, barras laterais e animações ficam indisponíveis lá e aparecem desligados no painel;
- nenhum `MutationObserver` é criado, e a extensão não mexe em `XMLHttpRequest`, `fetch` nem `addEventListener`, que são pontos onde a BOAnimes atua.

Para mudar o perfil, edite `shared/features.js` (`PROFILES`) e o `exclude_matches` do manifesto.

## Estrutura
```
extensao/
├── manifest.json        Manifest V3 (permissões: storage, activeTab, tabs, alarms, declarativeNetRequest)
├── shared/features.js   lista de funções e perfis (usada pelo conteúdo e pelo popup)
├── content/main.js      aplica as funções à página (mundo isolado)
├── content/page.js      bloqueio de pop-ups (mundo da página; não roda na Crunchyroll)
├── background.js        suspensão de abas, bloqueio de terceiros e estatísticas (service worker)
├── popup/               painel (HTML, CSS, JS)
└── icons/
```
Dados ficam em `chrome.storage.local` (`ws_defaults`, `ws_pages`, `ws_hosts`, `ws_config`, `ws_tabs`, `ws_stats`, `ws_off`). Nada sai do navegador.
