# Web Suite 4 — conexão, desempenho, privacidade e tema

Userscript (Tampermonkey/Violentmonkey) para qualquer site `http(s)`. Funciona em Chrome, Brave e Edge.

## Instalar
1. Abra o gerenciador de scripts e crie um script novo com o conteúdo de `web-suite.user.js`.
2. **Desative a versão 3** (se estiver instalada): as duas usam `window.open` e o mesmo tipo de painel.
3. Atalho do painel: **Alt+Shift+W** (ou o menu do gerenciador → "Abrir painel Web Suite").

## O que é novo na versão 4
| Função | O que faz | Padrão |
|---|---|---|
| Pré-carregar links ao passar o mouse | Busca a próxima página quando o mouse repousa 80 ms num link do mesmo site. Ignora sair/excluir/comprar/baixar. | ligado |
| Preparar conexões de terceiros | Depois do carregamento, `preconnect` às 3 origens externas mais usadas (descobertas pelo Resource Timing). | ligado |
| Modo econômico em conexão lenta | Com Save-Data ou rede 2G/3G liga sozinho lazy de imagens e iframes e reduz o preload de vídeo. Respeita o que você decidiu na página. | ligado |
| Recarregar imagens que falharam | Quando a internet volta, tenta de novo as imagens quebradas (máx. 30). | ligado |
| Aviso de conexão | Mostra "sem conexão" / "restabelecida". | ligado |
| Reduzir animações | Encurta animações e transições CSS a quase zero. | desligado |
| **Diagnóstico** (no painel) | DNS, conexão, TLS, 1º byte, DOM pronto, carga, peso transferido, 5 maiores recursos, tarefas longas, memória JS e tipo de rede. Há "Copiar relatório". | só leitura |

Mantido da versão 3: bloqueio de pop-ups, limpeza de parâmetros de rastreamento, lazy de imagens/iframes, feeds leves, pausa de vídeos, tema escuro, banners e barras laterais, exclusões por página e por função.

Mudanças de base: detecção de navegação em SPA pelo **Navigation API** (sem polling quando existe), funções em grupos no painel, e o painel passa a ter o id `web-suite-v4-panel`.

## Convivência com a extensão BOAnimes (Crunchyroll)
No domínio `crunchyroll.com` o script entra em **perfil de convivência**:

- só ficam disponíveis `tracking` (reescreve o endereço, sem tocar na página), `connect` (um `preconnect`) e `offline` (aviso);
- imagens, iframes, vídeo, tema, banners, barras laterais e pop-ups **ficam desligados**, porque a extensão já cuida de imagens (modo leve), player, tema e rolagem e observa a página do jeito dela;
- nenhum `MutationObserver` é criado, e o botão flutuante fica escondido para não cobrir o player (use Alt+Shift+W);
- o script não altera `XMLHttpRequest`, `fetch` nem `addEventListener` globais, que é onde a extensão atua.

Para mudar isso, edite `PROFILES` no começo do script.

## Teste
O comportamento foi conferido numa página local de teste (dentro de um iframe, porque o script usa `@noframes`): modo econômico (rede 3G simulada), pré-carregamento (ignorou `/logout`), limpeza de `utm_*`, diagnóstico e o perfil de convivência (sem alterações no DOM, sem prefetch, só 3 funções). **Não foi testado dentro da própria Crunchyroll com o Tampermonkey instalado.**
