# Pendências e anotações (WEBoa)

Preencher conforme os testes nos sites reais forem feitos. Formato: [ ] aberto, [x] resolvido.

## A testar com a extensão recarregada (1.5.0)
- [ ] YouTube: Shorts ocultos, fachadas, feed, console sem erros, vídeo toca normal
- [ ] Twitch: conexão (preconnect), nenhum impacto no player/chat
- [ ] Instagram: pausar vídeo de feed fora da tela, imagens sem piscar
- [ ] X/Twitter: login pelo Google, imagens sem piscar ao rolar (feed já removido do X)
- [ ] TikTok: pausar vídeo fora da tela não quebra a rolagem
- [ ] Google: links diretos (/url?q=) e ping removido, busca normal
- [ ] Crunchyroll com a BOAnimes: sem erros no console, só tracking/connect/offline ativos
- [ ] Painel nos 5 temas (visual real)
- [ ] Ampliar imagens: botão aparece no X, Instagram, Google Imagens e YouTube sem atrapalhar cliques; imagens dentro de links (não deve navegar)
- [ ] Ampliar imagens: aparência real (screenshot) e foco do teclado
- [ ] Atalho Alt+Shift+W em página real (exclui e volta)
- [ ] Liberar cópia em um site que bloqueia seleção
- [ ] Pedido de notificações realmente impedido (site que pede permissão)

## Problemas encontrados
- (nenhum ainda)

## Ideias para depois
- GIF pausado até passar o mouse (adiado: mexe muito no layout)
- Modo bateria (adiado: o navegador já limita timers em aba oculta)

## Teste 2026-11-17 (lightbox novo)
- OK: botão aparece em imagem comum, não aparece em <video>, poster sobreposto a vídeo nem miniatura de /watch (YouTube real); overlay ajusta à tela, zoom por roda, Esc fecha; Wikipédia real abre normal.
- OK: Crunchyroll simulada sem lightbox. Console do YouTube sem erros.
- Não testado: X, Instagram, TikTok, Twitch logados, arrasto com mouse real.

## Teste 2026-11-17 (sites reais, logado, só leitura; código instalado = antes da renomeação)
- X /home: 227 quadros rolando, 0 imagens vazias, sem erros; botão ⤢ em fotos, nenhum em vídeos (videoPlayer); abriu foto 503×598.
- Instagram: 352 quadros, 0 vazias, sem erros; botão em imagem do feed (sem vídeo na tela para testar a pausa).
- TikTok: botão não aparece sobre vídeo. Twitch: idem, sem erros. YouTube: miniaturas /watch sem botão.
- Google (gatos): links já sem /url? e sem ping; único erro de console vem de outra extensão.
- Falta: pausa de vídeo de feed com vídeo realmente em tela, arrasto com mouse real, recarregar a extensão para validar a renomeação WEBoa.

## Google, resposta por IA no tema AMOLED (corrigido no código, falta ver com a extensão recarregada)
- Problema: o degradê do "Mostrar mais" e a caixa quadrada atrás do botão usavam o cinza do tema escuro do Google (rgb 34,36,42) e viravam faixas cinzas sobre o fundo preto.
- Correção: no módulo `dark`, só em google.*, troca esse cinza do degradê pela cor do tema e deixa a caixa quadrada transparente (desfeito ao desligar). Visto numa simulação na página real; falta conferir com a extensão recarregada.

## 1.6.0 (abas por tipo + tema por elemento)
- OK no teste local: abas de tipo no painel (Esta página e Padrões), Temas/Backup, chaves do tema gravam e aplicam na hora (links, fundos, formulários, escurecer imagens).
- Falta ver em sites reais com a extensão recarregada (aparência do painel com as abas em cada tema do painel).

## Visual RedRat (2026-11-17)
- Painel agora vermelho (#f02043) por padrao; tema "Laranja" (amber) mantido como opcao. Conferido so em captura do popup-test.
- Pendente: recarregar a extensao no Brave e ver o painel real, nos temas claro/azul/roxo. Nada enviado ao GitHub.
