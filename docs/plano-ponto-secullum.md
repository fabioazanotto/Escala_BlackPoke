# Plano da integração Secullum Ponto Web (proposta, aguardando aprovação)

Sem dados pessoais nem segredos: este arquivo está num repositório público.
Nada deste plano foi implementado. Estado: **auditoria concluída; aguardando respostas e aprovação.**

## 1. Verificação da API do Secullum (atualizada)

O manual oficial e o Swagger foram lidos; o contrato verificado está em `docs/secullum-api.md`.
- Autenticação: `POST autenticador.secullum.com.br/Token` com `client_id=3`, como no prompt; token por Bearer e banco no
  cabeçalho `secullumidbancoselecionado`. Os endereços do prompt estavam certos; os nomes de campos de `Batidas` **não** estão no manual.
- **Achado importante:** `GET /FonteDados/APartirDoId` entrega **cada batida individual** (Data, Hora, Tipo, Origem,
  DataInclusao, EquipamentoId) por ID crescente, até 5.000 por chamada. É a base mais confiável da sincronização
  incremental, melhor que depender do formato agrupado de `/Batidas`, cujo corpo não é documentado.
- `Funcionarios` + `Horarios` dão a jornada prevista por dia da semana (Entrada1..5/Saida1..5, TipoDia, Carga, tolerâncias).
- `POST /Calcular` é só consulta e devolve os cálculos oficiais; limite de 1 mês e **100 chamadas por hora por banco**.
- Funcionários exigem autorização LGPD do administrador do Secullum; a conta da integração precisa estar marcada em
  Manutenções > Integração com Sistemas.
- Validade do token e período máximo de `/Batidas` não estão documentados.
- Rede: a API só é alcançável pelo site na Vercel. Por isso a Fase 1 começa por uma rota de diagnóstico (só admin) que devolve só a
  estrutura da resposta, sem nomes, CPFs ou horários.

**Estrutura do Secullum da BlackPoke (levantada pela tela):** 1 banco, 5 empresas (CNPJs distintos), 9 departamentos
(funções como Cozinha e Salão, não lojas), 4 equipamentos (aplicativos Checkin e Ponto Virtual, sem relógio físico),
45 funcionários ativos e 77 desligados. Cada loja é uma **empresa** dentro do mesmo banco. (IDs e CNPJs ficam fora deste
arquivo por ser público; entram só na tabela de configuração.)

## 2. Diagnóstico do projeto existente

| Item | Situação |
|---|---|
| Tecnologias | Next.js 16 (App Router, TypeScript, Tailwind 4), Supabase (Postgres + Auth + RLS), Vercel. Sem ORM: consultas diretas pelo cliente do Supabase. Vitest para testes (108 passando). |
| Backend | Route Handlers em `src/app/api`. Padrão já usado no Xmenu: adaptador em `src/lib/integracoes/`, lógica pura em `src/lib/<área>/`, ligação com banco em `src/lib/servidor/`. |
| Autenticação | Supabase Auth (e-mail e senha). Perfis `admin`, `rh`, `gerencia` em `perfis`; unidades por usuário em `usuario_unidades` (hoje **vazia**). Regras no banco: `eh_admin()`, `eh_rh()`, `eh_usuario()`, `pode_unidade()`. Rotas do servidor validam o JWT (`src/lib/servidor/admin.ts`). |
| Unidades | `unidades` com 2 linhas (Santos, Praia Grande). **Não** há ligação com as 4 lojas do Xmenu (`lojas_xmenu`: PG, Santos, Seu Miyagi, ABC). |
| Colaboradores | `colaboradores` (22 linhas): unidade única, nome, matrícula, CPF (opcional), função principal, `turno` dia/noite, admissão, desligamento, ativo, cargo. `colaborador_funcoes` para funções extras (vazia). |
| Escalas | `escalas_mensais` (status rascunho / em_revisão / publicada / publicada_com_alteracoes, `versao`), `escala_dias` (situação por colaborador e dia: trabalha, folga, domingo, férias, afastamento, indisponibilidade, dobra, fora), `escala_alteracoes` (histórico de edições manuais), `regras_unidade`. Jornada = `jornadas` por unidade e turno (09:00–17:20 dia; 16:00–00:20 noite) + `funcionamento`. |
| Auditoria | Tabela `auditoria` (antes/depois em JSON) alimentada por gatilho `registrar_auditoria()` nas tabelas principais. Reutilizável. |
| Sincronização | Já existe o padrão Vercel + Supabase `pg_cron` + `pg_net` + Vault (segredo do agendador fora do código), com registro em `sincronizacoes` e marco de histórico. Reutilizável para o ponto. |
| Interface | Sidebar/topbar, `CabecalhoPagina`, classes `.botao`, `.campo`, `.cartao`, `.filtro`; abas do RH em `src/config/menu.ts`. |
| Legado | Tabelas da primeira demonstração (`funcionarios`, `turnos`, `escalas`, `regras`, `configuracoes`) ainda existem, sem uso pelas telas atuais. Não serão tocadas. |
| Parâmetros | `parametros` tem as regras legais (descanso, jornada máxima, adicional noturno etc.) **em branco e não validadas**. Feriados: 0 registros. |

## 3. Incompatibilidades a resolver antes de consolidar

1. **Escala publicada não é um retrato.** `escala_dias` é sobrescrita nas edições; só há `versao` (número) e o
   histórico de alterações. Para "preservar a versão da escala usada em cada cálculo" é preciso um **snapshot
   imutável na publicação** (a etapa de publicação ainda não existe). Sem isso o comparativo mudaria com a escala.
2. **Colaborador com uma unidade só.** Não há histórico de transferência nem de vínculo. É preciso uma tabela de
   vínculos (unidade, início, fim) e um identificador estável separado do CPF.
3. **Jornada individual inexistente.** Hoje a jornada vem do turno dia/noite da unidade. A hierarquia pedida
   (escala individual, jornada do Secullum, histórico, padrão da unidade) precisa de um lugar para a jornada
   prevista por colaborador e data.
4. **Unidade do app × loja do Xmenu × banco do Secullum** são três conceitos sem ligação formal.
5. **Permissões por perfil, não por permissão.** Só há `admin/rh/gerencia`. "Diretoria" e permissões finas
   (ver ponto, justificar, fechar) não existem. `usuario_unidades` está vazia, então gerência hoje enxerga por regra
   do perfil e não por unidade atribuída. Precisa ser preenchida e usada nas políticas do ponto.
6. **CPF é dado sensível** e hoje fica em texto no cadastro, visível a quem pode ver a unidade. Para o vínculo
   com o Secullum guardar também um identificador estável e restringir o CPF por permissão.
7. **Feriados vazios e regras legais não validadas**: cálculo de horas extras, adicional noturno e tolerâncias
   fica bloqueado para valores oficiais até o RH/contador validar.

## 4. Arquitetura proposta

**Princípios:** Secullum é a fonte oficial das marcações; BlackPoke consulta, guarda cópia versionada e compara.
Somente leitura na primeira versão. Nenhuma credencial no navegador.

**Credenciais:** usuário e senha do Secullum em variáveis da Vercel marcadas como Secret (nunca no banco nem no
código). Os **IDs dos bancos** não são segredo e ficam na tabela de configuração. Token em memória no servidor, com
uma única reautenticação controlada em caso de 401. Logs sem senha, token ou dados pessoais.

**Tabelas novas (todas com RLS por unidade e auditoria; SQL mostrado antes de rodar):**

| Tabela | Função |
|---|---|
| `ponto_bancos` | Banco/empresa do Secullum (ID do banco, nome, ativo). Várias unidades podem usar o mesmo banco sem duplicar registros. |
| `ponto_unidade_banco` | Liga unidade a banco (e a equipamentos, se a API informar). |
| `colaborador_vinculos` | Histórico de lotação: colaborador, unidade, início, fim, motivo. Preserva em que unidade cada jornada ocorreu. |
| `colaborador_ponto_ids` | Colaborador ↔ funcionário no Secullum (banco, id externo, CPF normalizado criptografado ou com hash, período de vínculo). |
| `ponto_funcionarios_cache` | Cópia dos funcionários lidos (só leitura) para conferir divergências, duplicidades e inativos. |
| `ponto_marcacoes` | Marcação por colaborador e dia: dado bruto original (JSON), horários normalizados, texto especial (FOLGA, FALTA), origem, `FonteDados`, versão, hash, recebido em. |
| `ponto_marcacoes_historico` | Versões anteriores quando o Secullum altera um dia já sincronizado (nunca sobrescreve em silêncio). |
| `escala_snapshots` | Retrato imutável de cada publicação de escala (por mês e unidade). |
| `ponto_apuracao` | Resultado do cálculo por colaborador e dia: jornada usada e sua origem (escala/Secullum/histórico/padrão), regra aplicada, versão da escala, marcado como oficial ou provisório. |
| `ponto_ocorrencias` | Ocorrências e justificativas internas, com estado "registrada no BlackPoke" × "processada no Secullum". |
| `ponto_fechamentos` + `ponto_fechamento_itens` | Estados aberto, em conferência, com pendências, conferido, fechado; congela período, unidade, colaborador, versão da escala, dados e regras; histórico de reaberturas. |
| `ponto_sincronizacoes` | Registro de cada sincronização (banco, período, status, erro, duração) e trava contra concorrência. |
| `ponto_regras` | Regras de cálculo por unidade, vínculo e vigência (tolerâncias, noturno, etc.), com `validado` e fonte, como já é em `parametros`. |

**Código:** `src/lib/integracoes/secullum.ts` (cliente e tradução para o formato interno), `src/lib/ponto/`
(parser, motor de cálculo e comparação, funções puras com testes), `src/lib/servidor/` (ligação com banco),
`src/app/api/ponto/*` (diagnóstico, sincronização, exportações), telas em `src/app/ponto/*` dentro do RH.
Agendador reaproveita o padrão `pg_cron + pg_net + Vault`.

**Multiunidades:** configuração por unidade; um banco do Secullum pode atender várias unidades; leitura só
do banco vinculado; visão consolidada só das unidades autorizadas, aplicada nas políticas do banco (RLS) e
novamente na rota do servidor.

**Motor de cálculo (uma só implementação, reutilizada pelas telas):** tudo parametrizado por `ponto_regras`.
Sem regra validada, o resultado sai como **provisório** e não gera desconto nem hora extra oficial. Mantém separados
minutos reais noturnos, horas noturnas convertidas e quantidade para folha (esta só após validação). Não confunde hora
excedente com hora extra devida; não trata falta de batida como falta injustificada nem atestado como falta.
Cálculo interno é reconciliado com o resultado oficial do Secullum e as diferenças vão para relatório próprio.

## 5. Matriz de permissões proposta (para aprovação)

| Ação | Admin | RH | Gerência (só unidades atribuídas) | Diretoria |
|---|---|---|---|---|
| Configurar integração, credenciais, bancos, logs | sim (inclui Diretoria) | não | não | não |
| Ver marcações e cartão de ponto | sim | sim | sim | só indicadores consolidados |
| Escala × Ponto | sim | sim | sim | indicadores |
| Registrar justificativa interna | sim | sim | sim (operacional) | não |
| Conferir e fechar mês | sim | sim | não | não |
| Reabrir fechamento | sim | sim (com motivo) | não | não |
| Ver CPF completo | sim | sim | não | não |

Decidido: **Diretoria é o perfil admin**, então a coluna Diretoria acompanha a coluna Admin. As permissões seriam
efetivas (tabela de permissões), não pelo nome do cargo.

## 6. Plano em fases

Cada fase termina em entrega pequena, verificável e reversível. Só avança com o critério de aceite cumprido.

### Fase 1 — Fundação
- **Objetivo:** modelagem, permissões, credenciais e prova de conexão.
- **Arquivos:** `supabase/escala/1x_*.sql` (tabelas de bancos, vínculos, snapshots, regras), `src/lib/integracoes/secullum.ts`,
  `src/app/api/ponto/diagnostico/route.ts`, `src/config/menu.ts`, `docs/secullum-api.md`.
- **Alterações:** criar `ponto_bancos`, `ponto_unidade_banco`, `colaborador_vinculos`, `colaborador_ponto_ids`, `ponto_sincronizacoes`,
  `ponto_regras`; permissões; rota de diagnóstico; documento do contrato real.
- **Dependências:** documento/Swagger do Secullum; usuário de API; variáveis na Vercel; respostas da seção 7.
- **Riscos:** contrato da API diferente do prompt; usuário sem acesso a algum banco; CPF e LGPD.
- **Aceite:** diagnóstico (só admin) autentica, lista bancos, mostra estrutura de funcionários e batidas sem dados pessoais; contrato documentado.
- **Testes:** autenticação, token expirado, 401 com uma reautenticação, banco incorreto, timeout, falha de rede.
- **Para avançar:** você confere o contrato documentado e aprova os campos.

### Fase 2 — Integração
- **Objetivo:** ler funcionários e marcações e guardar com versão.
- **Arquivos:** `src/lib/ponto/parser.ts`, `src/lib/servidor/sincronizarPonto.ts`, `src/app/api/ponto/sincronizar/route.ts`, agendador.
- **Alterações:** sincronização incremental por `FonteDados/APartirDoId` (cursor por banco) e reprocesso de dias recentes; parser (HH, FOLGA/FALTA, até 5 pares, virada de meia-noite, duplicidade); `ponto_marcacoes` e histórico;
  conferência de funcionários (nos dois, só em um, divergências, duplicidades, inativos); sincronização inicial, incremental e reprocesso de dias recentes; trava de concorrência.
- **Dependências:** Fase 1; limites reais da API.
- **Riscos:** paginação e limites desconhecidos; mudança retroativa; fusos e virada de dia.
- **Aceite:** sincronizar um período sem duplicar; reexecutar dá o mesmo resultado; alteração no Secullum gera nova versão; falha mostra dado antigo com aviso.
- **Testes:** parser (todos os casos do prompt), sincronização duplicada, retroativos, indisponibilidade, múltiplas unidades, permissões.
- **Para avançar:** conferência de funcionários revisada pelo RH.

### Fase 3 — Interface
- **Objetivo:** telas de consulta.
- **Arquivos:** `src/app/ponto/*` (painel, marcações, cartão de ponto, ocorrências, configurações), exportações CSV e PDF.
- **Alterações:** abas no RH; filtros; estado "dados desatualizados"; nunca afirmar que alguém está trabalhando só pela última batida.
- **Dependências:** Fase 2.
- **Riscos:** excesso de informação no celular; desempenho em períodos longos.
- **Aceite:** RH consulta o mês de um colaborador, exporta CSV; gerência vê só a sua unidade (testado no servidor).
- **Testes:** permissões por unidade, exportações, estados vazio e erro.
- **Para avançar:** RH valida o formato do cartão de ponto.

### Fase 4 — Escalas
- **Objetivo:** comparar escala publicada × ponto realizado.
- **Arquivos:** publicação de escala com `escala_snapshots`, `src/lib/ponto/comparar.ts`, tela Escala × Ponto.
- **Alterações:** publicar escala gerando snapshot; hierarquia de jornada configurável; marcar divergências (atraso, saída antecipada, folga trabalhada, trabalho não previsto, intervalo, falta de batida, escala × Secullum); jornada estimada sempre provisória.
- **Dependências:** Fase 2; publicação de escala (hoje inexistente); feriados; regras validadas pelo RH.
- **Riscos:** regras trabalhistas ainda em branco; dobra entre sushimans; jornadas de 7 a 8 dias seguidos em Santos.
- **Aceite:** o mesmo dia recalculado mais tarde usa a versão da escala da época; divergências aparecem sem gerar desconto.
- **Testes:** noturno, meia-noite, múltiplos intervalos, batidas incompletas, folga, feriado, ausência justificada.
- **Para avançar:** RH aprova as regras de tolerância e a hierarquia de jornada.

### Fase 5 — Fechamento
- **Objetivo:** conferência mensal e auditoria.
- **Arquivos:** `ponto_fechamentos`, tela de fechamento, exportação para RH e contabilidade, relatório de reconciliação com o Secullum.
- **Alterações:** estados aberto, em conferência, com pendências, conferido, fechado; reabertura autorizada; alterações posteriores no Secullum sinalizam reconciliação.
- **Dependências:** Fase 4; regras validadas.
- **Riscos:** fechar com regra não validada; mudança retroativa depois do fechamento.
- **Aceite:** fechamento congela dados e regras; mudança no Secullum não altera o fechado; reabertura registra responsável e motivo.
- **Testes:** fechamento e reabertura, divergência com o oficial, permissões.
- **Para avançar:** você e o RH aprovam o modelo de exportação.

### Fase 6 — Homologação
- **Objetivo:** validar com dados reais autorizados.
- **Alterações:** correções; comparação do cálculo com o relatório oficial do Secullum de um mês fechado; checklist LGPD.
- **Dependências:** dados reais e acesso autorizado.
- **Riscos:** diferenças de critério; dados pessoais em testes.
- **Aceite:** diferenças contra o oficial explicadas e aceitas pelo RH.
- **Condição final:** só depois disso se avalia qualquer escrita no Secullum (Etapa 13 do prompt).

## 7. Decisões e perguntas

**Respondidas pelo dono**
- **Seu Miyagi divide a casa com a unidade Santos** (escala e calendário de folgas juntos), mas é **empresa separada** para ponto, admissão e demissão.
  Modelo: a unidade do app é a casa (escala); a empresa do Secullum (vínculo confirmado) define o controle de ponto e o vínculo trabalhista.
  ABC (empresa B. P SBC) continua sem unidade no app, por ora.
- **Diretoria = perfil `admin`.** Não cria perfil novo.
- **Regras trabalhistas (noturno, tolerâncias, banco de horas) ficam para depois.** Até lá, todo cálculo é provisório.
- Exemplo de jornada informado para teste (turno do dia): entrada 09:00, saída para intervalo 15:00, retorno 16:00,
  fim 17:20 (6h00 + 1h20 = 7h20, intervalo 1h00, sem horas noturnas).

**Respondidas pelo levantamento no Secullum**
- Há 1 banco e 5 empresas; cada loja é uma empresa. Não existe usuário de API: a integração usa uma Conta Secullum comum, autorizada no banco.
- Documentação oficial obtida (manual + Swagger).

**Decidido pelo dono**
- Mapeamento confirmado: cada loja do app corresponde a uma empresa do Secullum (Santos e Seu Miyagi apontam para a mesma casa/unidade Santos) (identificadas por CNPJ na tabela de configuração, não neste arquivo).
- **Uma das 5 empresas do banco fica fora do projeto.** O adaptador filtra por empresa e descarta os funcionários e marcações dela
  antes de gravar (minimização de dados, LGPD). Só as empresas explicitamente vinculadas a uma unidade são lidas.
- A integração usará uma **Conta Secullum própria do BlackPoke** (não a de uma pessoa), com credenciais só na Vercel (Secret).

**Levantado no Secullum (conta da integração)**
- A autorização LGPD é **por usuário**: Manutenções > Usuários > Cadastro > abrir o usuário > "Permitir a visualização e edição de dados protegidos pela LGPD". Não existe por banco nem por perfil.
- No mesmo formulário: "Não permitir alterações de registros de ponto e cálculos" (será marcado na conta da integração, como proteção extra de somente leitura)
  e "Restrições por empresas" (será usado para limitar a conta às empresas incluídas no projeto; o filtro no código continua como segunda barreira).
- Existe o campo "Termo Aceito em": pode ser preciso entrar uma vez no Ponto Web com a conta para aceitar o termo da LGPD (a confirmar).
- Ainda **não confirmado** se o tipo "Usuário" (em vez de Administrador) pode receber a autorização LGPD: começar por "Usuário" e subir só se a API recusar.
- A conta da integração marcada em "Integração com Sistemas" é o que libera a conexão; a marcação LGPD do mesmo usuário provavelmente libera os dados protegidos (a confirmar no diagnóstico).

**Ainda abertas**
1. Se "Não permitir alterações..." bloqueia também a consulta `Calcular` (testar no diagnóstico; se bloquear, desmarcar).
2. Batidas do caso noturno da seção 8 (usaremos a variante B se nada for dito).

## 8. Caso de teste obrigatório: inconsistência encontrada

Jornada prevista 16:00–17:45 / 18:45–23:45. Conferi a conta:

| Batidas | Períodos | Total | Intervalo | Noturno real / reduzido |
|---|---|---|---|---|
| **A** como escrito no prompt: 16:04 / 18:50 / 19:50 / 23:45 | 2h46 + 3h55 | **6h41** | 1h00 | 1h45 / 2h00 |
| **B** provável intenção: 16:04 / 17:50 / 18:50 / 23:45 | 1h46 + 4h55 | **6h41** | 1h00 | 1h45 / 2h00 |
| **C** necessária para os números do prompt: 16:04 / 17:50 / 18:50 / 23:50 | 1h46 + 5h00 | **6h46** | 1h00 | 1h50 / 2h06 |

Os números esperados do prompt (1h46, 5h00, 6h46) só fecham com a saída às 23:50, mas aí o noturno seria
1h50 / 2h06, não 1h45 / 2h00. Os dados do prompt se contradizem. Com 23:45 o total correto é **6h41**,
o valor que o prompt mandava descartar. O teste será escrito com as batidas confirmadas por você, sem ajustar a conta.

## 9. Regras que permanecem

Somente leitura no Secullum. Nada de cadastrar, alterar registros, aprovar ajustes ou mexer em jornadas lá.
Sem DNS ou rede alterados sem diagnóstico e autorização. Sem descontos, valores de folha ou penalizações
automáticas (inclusive no Time de Ouro) sem validação separada. Cada fase pede aprovação antes de começar.
