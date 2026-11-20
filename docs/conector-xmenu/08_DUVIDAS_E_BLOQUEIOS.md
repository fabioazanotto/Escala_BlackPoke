# 08 · Dúvidas, bloqueios e pontos que exigem pessoa

Situação em 20/11/2026, ao fim da fase de diagnóstico. **Nenhuma operação foi feita no XMenu.**

## 1. Bloqueios (impedem o próximo passo)

| # | Bloqueio | Quem resolve | O que fazer |
|---|---|---|---|
| B1 | **Autorização específica** para uso programático do backend do portal (`aws.netcontroll.com.br`: `netadm`, `netweb`, `netreport`). "Autorização para integrações" genérica não diz se cobre rotas internas, nem leitura × escrita | Dono, junto à Netcontroll | Pedir por e-mail ou contrato: (a) permissão para ler financeiro e relatórios por essas rotas com usuário próprio; (b) permissão separada para criar despesas; (c) limites de chamadas; (d) se há loja ou ambiente de **teste**; (e) impacto do "Novo Portal" nessas rotas e o calendário |
| B2 | **Sessão autenticada para investigação** (fases 4.1/4.2 do pedido): menus, permissões, campos e tráfego reais **não foram observados** | Dono | Opção 1: app Claude desktop no computador do dono, com Remote Control ativo (Configurações > Claude Code > Remote Control), e numa nova sessão pedir para usar o navegador logado. Opção 2: arquivo HAR do DevTools, limpo de senhas e tokens (ver Teste 0 em 06). **Nunca enviar senha na conversa** |
| B3 | **Usuário de integração** no portal com permissões mínimas (Financeiro e Relatórios, leitura) e credenciais na Vercel | Dono | Criar em Segurança > Usuários; cadastrar `XMENU_PORTAL_USUARIO` e `XMENU_PORTAL_SENHA` como Secret na Vercel |
| B4 | **Login com código por SMS/WhatsApp** (o portal tem esse modo): se for obrigatório para o usuário de integração, o login automático no servidor não é possível | Dono / Netcontroll | Verificar ao criar o usuário; se obrigatório, pedir à Netcontroll uma forma autorizada para integração |

## 2. Informações não verificadas

| # | Dúvida | Como esclarecer |
|---|---|---|
| D1 | A BlackPoke tem licença **Multilojas**? Qual loja é a matriz? | Ver se aparece o menu "Central Multilojas" no portal |
| D2 | O id do "parceiro" no portal é o mesmo código de loja já usado (20210, 20211, 20773, 22010)? | Teste 2 |
| D3 | Formato de um lançamento do livro-caixa (como distingue receita × despesa, aberto × pago, parcelas, rateio) | Teste 0 / Teste 3 |
| D4 | Significado de `Ordem` e o tipo de data usado em `livro-caixa/intervalo`; regra de fuso no limite do dia | Teste 3 |
| D5 | Paginação: as listagens parecem vir inteiras; há limite de período? | Teste 3 / Teste 4 |
| D6 | Como o portal busca os dados de cada relatório (rota e parâmetros exatos no `NetReport`) | Teste 0 |
| D7 | Pagamento parcial deixa saldo em aberto ou encerra o título? | Teste 0 (só observar uma despesa já paga parcialmente, se existir) |
| D8 | Há envio de anexo pela API? Existe histórico de alterações de um lançamento? | Teste 0 |
| D9 | Duração do token, sessões simultâneas permitidas, bloqueio por tentativas | Teste 1 |
| D10 | "507 Zera Caixa" é só relatório ou executa algo? | Teste 0. Até lá, **fora da lista permitida** |
| D11 | Quais operações financeiras o dono quer escrever primeiro (despesa manual? baixa? recorrentes?) | Conversa com o dono antes da Etapa 4 |

## 3. Hipóteses técnicas assumidas (a confirmar)

- H1. O token da loja limita os dados àquela loja (isolamento por token).
- H2. Os relatórios recebem JSON estruturado; o Excel é gerado no navegador.
- H3. Pagar ou receber é uma atualização (`PUT livro-caixa`) com os dados de pagamento.
- H4. Excluir lançamento é definitivo (não há `undelete` para livro-caixa, ao contrário dos cadastros).

## 4. Decisões já tomadas

- **20/11/2026, dono:** "esqueça a api pré existente". A Xmenu Data API (token por loja, só leitura de vendas e cadastros, usada no painel de Vendas) **não** é base nem alternativa do conector. Ela segue funcionando onde já está.
- **20/11/2026:** liberados na rede do ambiente de desenvolvimento `netcontroll.gitbook.io` e `portal.netcontroll.com.br`. `aws.netcontroll.com.br` **não** foi liberado nem chamado.

## 5. O que foi feito e o que não foi

| Feito | Não feito (por regra ou por falta de acesso) |
|---|---|
| Leitura de todo o repositório relevante do BlackPoke | Login no portal |
| Leitura das 3 documentações públicas (índices completos + ~50 páginas) | Qualquer chamada aos servidores de dados da Netcontroll |
| Leitura do HTML, dos cabeçalhos e do código JavaScript **público** da tela de login (pacote principal + 6 módulos) | Leitura de dados reais do restaurante |
| Mapa de rotas financeiras e de relatórios **observadas no código** | Validação de qualquer rota, campo ou paginação |
| Proposta de arquitetura, PoC e roadmap | Qualquer código do conector, tabela nova ou escrita |
