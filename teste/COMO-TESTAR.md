# Teste local da extensão WEBoa

Não precisa instalar a extensão: `chrome-shim.js` simula só o pedaço do `chrome.*` que ela usa.

1. Na pasta raiz (`WEBoa`): `python teste/log_server.py 8766   (registra em teste/requests.log cada requisicao e o cabecalho Sec-Purpose)`
2. Abra:
   - `http://localhost:8766/teste/wrap.html` — conteúdo numa página comum (dentro de um iframe, para não misturar com scripts do navegador);
   - `...wrap.html?slow` — simula rede 3G (modo econômico);
   - `...wrap.html?cr` — simula o domínio da Crunchyroll (perfil de convivência; usa `main-crunchyroll.js`, cópia de teste do `main.js`);
   - `http://localhost:8766/teste/popup-test.html` — o popup com uma aba e um estado de conteúdo falsos.
3. No console da aba de nível superior: `const w = document.getElementById('f').contentWindow;`
   - `w.__wsMsg({type:'WS_STATE',diagnostics:true},null,console.log)` mostra o estado;
   - `w.chrome.storage.local.set({ws_off:true})` simula a chave geral.

Se editar `extensao/content/main.js`, gere de novo a cópia da Crunchyroll:
`sed "s/const profile = profileFor(location.hostname);/const profile = profileFor('www.crunchyroll.com');/" ../extensao/content/main.js > main-crunchyroll.js`

## Teste do segundo plano (sem navegador)
`node teste/background-test.js` roda o background.js com um chrome.* simulado: suspensao (so a aba certa e descartada), bloqueio por nivel e por site, estatisticas.
