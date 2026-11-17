# Política de privacidade — WEBoa

Última atualização: 17/11/2026

**Resumo: o WEBoa não coleta, não envia e não vende nenhum dado seu.** Tudo acontece dentro do seu navegador.

## O que a extensão guarda
Somente no `chrome.storage` do seu próprio navegador (nunca em servidor):
- suas escolhas (funções ligadas/desligadas por padrão, por site e por página), listas de hosts e temas;
- contadores de economia (quantas imagens foram adiadas etc.);
- por aba e só na sessão: um tamanho aproximado de memória JavaScript e um aviso de "aba com formulário preenchido", usados para listar abas pesadas e para não suspender abas com formulário. Esses dados somem ao fechar o navegador.

A exportação de configurações gera um arquivo no seu computador, só quando você pede.

## O que a extensão NÃO faz
- Não envia dados a nenhum servidor, não usa analytics, anúncios, contas ou identificadores.
- Não lê o conteúdo de formulários, senhas, mensagens ou cookies. A única observação sobre formulários é "algum campo recebeu digitação" (sem o conteúdo), para evitar suspender a aba.
- Não carrega código remoto: todo o código está no pacote da extensão.

## Por que cada permissão
| Permissão | Para quê |
|---|---|
| `storage` | Guardar suas escolhas e contadores. |
| `activeTab` | O painel falar com a aba que está aberta. |
| `tabs` | Ler o endereço e o último uso das abas para suspender abas inativas, listar abas pesadas e aplicar a função só ao site atual. |
| `alarms` | Varredura de abas inativas a cada minuto (desligada por padrão). |
| `declarativeNetRequest` | Bloquear, pela rede e só se você ligar, uma lista curta de rastreadores e widgets. O navegador aplica as regras; a extensão não vê as suas requisições. |
| Acesso a `http://*/*` e `https://*/*` | Aplicar as otimizações (lazy de imagens, temas, bloqueio de pop-ups) nas páginas que você abre. |

## Terceiros
As funções "pré-carregar" e "preparar conexões" pedem ao navegador para falar com endereços que a própria página já usa (por exemplo, o destino de um link sobre o qual você passou o mouse). Isso é o mesmo que clicar no link adiantado e, como qualquer acesso, o site de destino enxerga seu IP. Ligue só nos sites em que confia.

## Contato
Dúvidas ou pedidos: https://github.com/Kemimir/Web-Suite/issues
