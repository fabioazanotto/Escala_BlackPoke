# 02 · Diagnóstico do XMenu / Portal Netcontroll

Investigação de 20/11/2026, **sem login**. Fontes usadas:

1. Documentação pública (GitBook): `xmenu-retaguarda-ajuda`, `xmenu-tecnico` e `xmenu-ecommerce-ajuda`, lidas pelo índice `llms.txt` e pelas páginas em Markdown.
2. Tela pública de login do portal (`https://portal.netcontroll.com.br/`): HTML, cabeçalhos HTTP e os arquivos JavaScript que **qualquer navegador baixa** ao abrir essa tela (pacote principal e 6 módulos carregados sob demanda).

**Não foi feita** nenhuma chamada aos servidores de dados, nenhuma tentativa de login e nenhuma leitura de dados do restaurante.
A "Xmenu Data API" que o projeto já usa foi deixada de fora por decisão do dono.

## 1. Arquitetura do produto

| Componente | O que é | Fonte |
|---|---|---|
| NetPDV / Concentrador | Programa local na loja (PDV, caixa, impressão, banco local). Sincroniza com a nuvem. | [FATO] doc técnica: "Concentrador", "Zerando o banco de dados", "Política de sincronização" |
| Portal XMenu (retaguarda) | Aplicação web de gestão: cadastros, estoque, **financeiro**, relatórios, configurações | [FATO] doc retaguarda |
| ADM/Master | Painel da Netcontroll e das revendas (licenças, clientes) | [FATO] doc técnica "ADM Master" |
| NetIntegrador | Programa local que exporta pedidos para parceiros (ex.: Repediu) | [FATO] doc "Aplicativos de Gestão e CRM" |
| Licenças por recurso | Multilojas, Conciliadora, Foody, Repediu etc. são ativadas no ADM/Master | [FATO] várias páginas |

## 2. Características técnicas do portal (observadas no código público)

| Item | Achado | Tipo |
|---|---|---|
| Framework | Angular **9.1.3** (build com ES5 e ES2015), NgRx, tema SmartAdmin, ngx-bootstrap, SlickGrid, componentes DevExpress | [FATO] versão escrita no pacote principal |
| Servidor da página | IIS 10 / ASP.NET (cabeçalhos `server` e `x-powered-by`) | [FATO] |
| Navegação | Aplicação de página única com rotas `#/...` (ex.: `#/configuracao/loja`, citada na doc) | [FATO] |
| Servidores de dados | Vários serviços REST em `https://aws.netcontroll.com.br/{serviço}/api/v1`: `netadm` (conta/loja), `netweb` (cadastros e financeiro), `netreport` (relatórios), `xmenu`, `XBot`, `Fidelidade`, `NetEtiqueta`, `NetMarketing`, `XMenuCheckList` | [EVIDÊNCIA] tabela de ambientes no pacote principal |
| Outros ambientes no código | `localhost:*`, `interno.netcontroll.com.br:*` e um IP privado: ambientes internos da Netcontroll, **inacessíveis e fora de escopo** | [EVIDÊNCIA] |
| Formato | JSON. Respostas lidas como `resposta.data` ou a lista direta | [EVIDÊNCIA] `t=>t&&t.data?t.data:t` |
| Cabeçalhos | `Authorization: Bearer <token>` e `App-Origin: Portal` | [EVIDÊNCIA] |
| Tempo real | SignalR (`accessTokenFactory`, `.../client/hub`) para impressão e etiquetas | [EVIDÊNCIA] |
| Exportação | Planilhas Excel geradas **no navegador** (JSZip, OpenXML, `saveAs("...xlsx")`); downloads de arquivo do servidor por `GetBlob` | [EVIDÊNCIA] |

## 3. Autenticação e sessão

[EVIDÊNCIA] Fluxo deduzido do código público. **Nenhuma** dessas rotas foi chamada.

```
1. POST netadm  account/login/            → token do USUÁRIO (access_token + expires_in)
   (alternativa: account/login/accountkit/{sms|whatsapp} + .../verify → login por código no celular)
2. GET  netadm  parceiro                  → lojas ("parceiros") que o usuário enxerga
                                             (com 1 loja só, seleciona sozinho)
3. POST netadm  parceiro/login            → token da LOJA escolhida (PartnerToken)
4. Chamadas de dados (netweb/netreport) com o token da loja
5. POST netadm  account/renew             → renovação; o portal renova quando faltam ≤ 30 s
```

- Os tokens ficam no `localStorage` do navegador (`UserToken`, `PartnerToken`, `PartnerXTagToken`).
- [HIPÓTESE] Como cada loja tem o seu token, o contexto de unidade é decidido no servidor da Netcontroll e não por um parâmetro de cada chamada. Isso é bom para a separação das unidades: um token de Santos não deveria ler Praia Grande. **Confirmar no Teste 2.**
- [PENDENTE] Não sabemos se a conta exige o código por SMS/WhatsApp (MFA) sempre, às vezes ou nunca. Se exigir sempre, o login automático no servidor fica inviável sem uma conta de integração liberada pelo fornecedor.
- [PENDENTE] Duração real do token (`expires_in`), comportamento após expirar, sessões simultâneas e bloqueio por tentativas: só na sessão autenticada.

## 4. Unidades (lojas)

- [FATO] A doc trata cada estabelecimento como "loja". A rede é montada pela licença **Multilojas**: a loja **matriz** ganha o menu "Central Multilojas", os "Agrupadores de Lojas" e os relatórios 1101 a 1104. As filiais apontam para o ID da matriz no ADM/Master. Matriz e filiais precisam da licença.
- [FATO] "Os relatórios e todas as outras opções relacionadas ao multilojas só estarão disponíveis para a loja **matriz**" (doc técnica "Multilojas").
- [FATO] Conciliadora: "Empresa ID e senha são individuais por loja, mesmo que a loja tenha filiais".
- [PENDENTE] Não se sabe se a BlackPoke tem a licença Multilojas, nem qual loja seria a matriz.
- [HIPÓTESE] Sem Multilojas, a consolidação entre unidades precisa ser feita pelo BlackPoke, lendo loja por loja (o que de todo modo é mais seguro).

## 5. Permissões

- [EVIDÊNCIA] Cada tela confere uma chave de permissão, por exemplo `NetWeb.Relatorio.DemonstrativoResultados`. O módulo Segurança tem `seguranca/usuario/permissao/{id}`, `.../permissao/replicar` e `.../permissao/exportar`.
- [HIPÓTESE] Isso permite criar um **usuário de integração** com acesso só ao financeiro e aos relatórios, sem cadastros nem configurações. [PENDENTE] confirmar na tela Segurança > Usuários.

## 6. Mudança de portal em andamento (importante)

- [EVIDÊNCIA] O código atual tem um convite "Novo Portal XMenu" (`pxm.portal.useNewPortal`, `migrationSnoozeUntil`, `account/portal-redirect-token`) e redireciona para um portal novo quando ativado.
- [FATO] As notas de versão já falam em "Portal 5.0" e "Portal Novo" (ex.: 5.0.36, 5.0.94). Os números de chamado nessas notas (#2218, #2773) recomeçam baixos, comparados aos anteriores (#107586…).
- [RISCO] **Alto.** Telas e rotas internas podem mudar com a migração. Qualquer integração por tela (C) ou por rota interna (B) precisa de verificação diária de contrato e de confirmação da Netcontroll sobre o calendário e a compatibilidade.

## 7. O que dá para afirmar sem login

| Pergunta | Resposta |
|---|---|
| Existe API oficial documentada para financeiro? | **Não encontrada** em nenhuma das 3 documentações. As integrações documentadas são de parceiros (iFood, Open Delivery, pagamentos, Conciliadora, Foody, Repediu). |
| O portal tem backend REST estruturado? | **Sim** [EVIDÊNCIA]: rotas `financeiro/*`, `relatorio/*`, `cadastro/*` em JSON. |
| Há mecanismos oficiais de exportação? | **Sim** [FATO]: "Exportar todos os dados" (Excel) nos relatórios e no DRE, e exportação do plano de contas em XLS. |
| Há importação oficial? | **Sim** [FATO]: OFX (extrato bancário → conciliação com receitas e despesas), XML de NF-e (entrada de mercadorias → gera despesa) e planilha de produtos. |
| Há ambiente de homologação para clientes? | **Não encontrado.** Os ambientes `interno.*` são da Netcontroll. |
| Limites de chamadas | **Não documentados.** |

## 8. Limitações desta investigação

- Sem sessão autenticada: menus reais da conta, permissões, campos exatos enviados e recebidos, paginação, erros e diferenças entre lojas **não foram observados**. O pedido de acesso está em 08.
- A análise de código cobre o pacote principal e 6 dos 197 módulos. Os formulários de despesa e receita e o serviço que busca os dados dos relatórios estão em módulos compartilhados que não foram baixados de propósito, para não varrer o site do fornecedor. Isso fica para a captura autenticada, que mostra o tráfego real.
