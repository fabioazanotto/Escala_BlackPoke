# 06 · Plano da prova de conceito (PoC)

Objetivo: provar, com o **menor código possível**, que o caminho B (rotas do portal, no servidor) é autorizado, estável e seguro antes de construir o conector.
Onde roda: numa **rota de diagnóstico só do admin** no BlackPoke publicado na Vercel. As credenciais ficam na Vercel e nunca passam pela conversa.
Esta sessão de desenvolvimento não alcança `aws.netcontroll.com.br` e não deve receber senha.

Pré-requisitos comuns a todos os testes (ver 08):
- P1. Autorização **escrita** da Netcontroll para uso programático do backend do portal (leitura; a escrita é pedida à parte).
- P2. **Usuário de integração** criado pelo dono no portal (Segurança > Usuários), só com permissões de Financeiro e Relatórios, de preferência sem código por SMS/WhatsApp.
- P3. Variáveis `XMENU_PORTAL_USUARIO` e `XMENU_PORTAL_SENHA` na Vercel (Secret), cadastradas pelo dono.
- P4. Captura autenticada (Teste 0) concluída, para confirmar rotas, parâmetros e formatos antes de escrever o cliente.

---

## Teste 0 · Captura autenticada (fecha o diagnóstico; sem código)

| Item | Conteúdo |
|---|---|
| Pré-requisitos | Dono logado no portal no próprio computador |
| Objetivo | Ver o tráfego real: login, troca de loja, listagem de despesas, um relatório financeiro, exportação Excel |
| Procedimento | **Opção 1 (preferida):** conectar o computador do dono a uma sessão do Claude (app desktop: Configurações > Claude Code > Remote Control) e usar o navegador com o dono logado; Claude só navega e lê, sem salvar nada. **Opção 2:** o dono abre DevTools (F12) > aba Rede, navega por Despesas, Receitas, Livro Caixa, Conciliação, Relatórios 901/504/508 e "Trocar loja", e salva o HAR. Antes de entregar, o HAR passa por um limpador que remove `Authorization`, cookies, senha e o corpo do login (script a fornecer na Etapa 0). |
| Sucesso | Lista confirmada de rotas, parâmetros, paginação, formato de lançamento e de relatório, comportamento da troca de loja e do vencimento do token |
| Riscos | HAR contém dados financeiros reais: fica fora do repositório e é apagado depois da análise |
| Evidências | Atualização de 02/03/04 com a marcação **[CONFIRMADO]** e amostras **anonimizadas** |
| Reversão | Não se aplica (só leitura) |

## Teste 1 · Autenticação

| Item | Conteúdo |
|---|---|
| Pré-requisitos | P1–P3 |
| Objetivo | Obter token de usuário e de loja pelo mecanismo do portal, sem passo humano |
| Procedimento | Rota `/api/xmenu-portal/diagnostico` (só admin): `account/login/`, depois `parceiro`, depois `parceiro/login` na 1ª loja. Devolve só: ok/erro, tempo, validade em segundos, quantidade de lojas |
| Sucesso | Login e token de loja obtidos em < 5 s; `expires_in` conhecido; nenhum segredo na resposta |
| Riscos | Bloqueio da conta por tentativas: no máximo 1 tentativa por execução e nenhuma repetição automática de login falho |
| Evidências | JSON do diagnóstico (sem token) + print do histórico de acesso do usuário no portal, se existir |
| Reversão | Não se aplica |

## Teste 2 · Identificação de unidades

| Item | Conteúdo |
|---|---|
| Pré-requisitos | Teste 1 |
| Objetivo | Listar as lojas acessíveis com identificador e nome; provar que o token de uma loja não lê outra |
| Procedimento | `GET parceiro` → lista `{id, nome}`. Para 2 lojas: entrar em cada uma e ler `financeiro/planos` (cadastro pequeno, sem dado pessoal), comparando contagens e um id; tentar ler com o token da loja A usando o contexto da loja B **apenas se houver parâmetro explícito de loja na rota**. Nunca forjar ou alterar token |
| Sucesso | Mapa parceiro ↔ loja BlackPoke fechado (inclusive Seu Miyagi); isolamento por token confirmado |
| Riscos | Baixo (só leitura de cadastro) |
| Evidências | Tabela `parceiro_id → loja` para preencher `xmenu_lojas_portal` |
| Reversão | Não se aplica |

## Teste 3 · Leitura financeira

| Item | Conteúdo |
|---|---|
| Pré-requisitos | Teste 2 |
| Objetivo | Ler despesas e receitas de **uma** loja num período curto, sem modificar nada |
| Procedimento | `GET financeiro/livro-caixa/intervalo` para 1 mês fechado, variando `Ordem`; o mesmo período com datas `T00:00:00` e com fuso, para achar a regra de limite do dia. Contar registros e somar valores por situação (aberto/pago). O diagnóstico devolve **só contagens, somas e nomes de campos** |
| Sucesso | Contagem e soma **iguais** às da tela Financeiro > Despesas e Receitas do mesmo período (conferido pelo dono); regra de data documentada; formato documentado |
| Riscos | Exposição de dados: a resposta do diagnóstico não traz linhas |
| Evidências | Print da tela do portal com o total + JSON do diagnóstico |
| Reversão | Não se aplica |

## Teste 4 · Consulta de relatório

| Item | Conteúdo |
|---|---|
| Pré-requisitos | Teste 3 |
| Objetivo | Extrair os dados estruturados de um relatório e conferir com o portal |
| Procedimento | Relatório **504 Fechamento de Caixa** ou **508 Resumo Movimento** de 1 dia fechado, numa loja. Comparar totais com o Excel exportado pelo dono do mesmo relatório e dia. Medir tempo e tamanho da resposta; repetir com 31 dias para medir volume |
| Sucesso | Totais idênticos ao Excel; tempo e volume medidos; janela máxima segura definida |
| Riscos | Carga no fornecedor: uma consulta por vez e no máximo 3 consultas no teste |
| Evidências | Excel do dono (fora do repositório) + JSON com totais |
| Reversão | Não se aplica |

## Teste 5 · Escrita controlada (**exige aprovação específica antes**)

| Item | Conteúdo |
|---|---|
| Pré-requisitos | Testes 1–4 aprovados; autorização **escrita** da Netcontroll para escrita; conta de escrita separada; aprovação expressa do dono com data e loja escolhidas; de preferência uma **loja de teste** fornecida pela Netcontroll |
| Objetivo | Criar **uma** despesa de teste e confirmar que ela aparece no portal |
| Procedimento | 1) O dono cria no portal um fornecedor "TESTE INTEGRACAO BLACKPOKE" e um plano de contas "TESTE INTEGRACAO" **fora dos perfis de DRE**. 2) Prévia no BlackPoke: valor R$ 0,01, emissão hoje, vencimento daqui a 60 dias, sem forma, sem conta, sem pagamento, Histórico `BP-<uuid> TESTE`. 3) Confirmação. 4) `POST financeiro/livro-caixa`, uma única vez. 5) Releitura do período procurando `BP-<uuid>`. 6) O dono confere na tela Despesas |
| Sucesso | Exatamente 1 registro, com os campos certos, na loja certa, visível no portal; auditoria com id do XMenu |
| Riscos | Duplicidade (mitigada pela chave + releitura); lançamento em loja errada (mitigado pela prévia); efeito em DRE (mitigado pelo plano isolado) |
| Evidências | Linha em `xmenu_escritas` + print do portal |
| Reversão | O **dono** exclui a despesa pelo portal (Despesas > excluir). O conector não ganha a operação de exclusão. Depois, o dono confere que o DRE do período não mudou |

## Teste 6 · Recuperação de falhas

| Item | Conteúdo |
|---|---|
| Pré-requisitos | Testes 1–3 (leitura); Teste 5 só para o item d |
| Objetivo | Provar que perda de sessão, indisponibilidade e resultado incerto não geram erro silencioso nem duplicidade |
| Procedimento | a) Usar um token vencido de propósito (esperar `expires_in` passar) → espera-se renovação ou 1 novo login. b) Tempo-limite artificial de 1 ms numa leitura → espera-se repetição e depois erro registrado. c) Resposta com campo esperado ausente (teste unitário com amostra alterada) → espera-se parada da rota e alerta. d) Na escrita, simular timeout **depois** do envio (teste unitário com `fetch` falso que grava e não responde) → espera-se `incerto`, releitura, **nenhum reenvio** |
| Sucesso | Os 4 cenários com o comportamento esperado; nenhuma duplicata |
| Riscos | Nenhum em produção: c e d são testes unitários; a e b são só leitura |
| Evidências | Saída do `npm test` + registros em `xmenu_sincronizacoes` |
| Reversão | Não se aplica |
