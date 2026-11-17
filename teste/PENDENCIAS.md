# Pendências e anotações (Web Suite)

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
