# Plano da integração Secullum Ponto Web (proposta, aguardando aprovação)

Sem dados pessoais nem segredos: este arquivo está num repositório público.
Nada deste plano foi implementado. Estado: **auditoria concluída; aguardando respostas e aprovação.**

## 1. O que foi (e não foi) possível verificar sobre a API do Secullum

- Não há documentação pública da API de integração externa. A busca na web só achou material genérico.
- O servidor `pontowebintegracaoexterna.secullum.com.br` não é alcançável daqui (rede restrita do ambiente
  de desenvolvimento), igual ao Xmenu. Só o site publicado na Vercel conseguirá chamá-lo.
- Os endereços, cabeçalhos e campos do prompt (`/Token`, `client_id=3`, `/Funcionarios`, `/Batidas`,
  `secullumidbancoselecionado`, `Entrada1..5`, `Saida1..5`) **ficam como hipótese não verificada**.
- O "documento original" citado no prompt não está no projeto. Preciso dele (PDF ou Swagger) para escrever o
  adaptador sem inventar campos.
- A `docs/api-ponto.md` atual descreve uma API **fictícia de demonstração** (Vila Tempero), não o Secullum.
  Ela será substituída; as variáveis `PONTO_*` dela não serão usadas.
- Plano de verificação: criar uma rota de diagnóstico só para admin (como a do Xmenu) que roda na Vercel,
  autentica, lista os bancos acessíveis e devolve **somente a estrutura** (nomes de campos, contagens,
  códigos de erro), nunca nomes, CPFs ou horários. Com isso o contrato real fica documentado antes do parser.

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
- **Alterações:** parser (HH, FOLGA/FALTA, até 5 pares, virada de meia-noite, duplicidade); `ponto_marcacoes` e histórico;
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
- Seu Miyagi e ABC entram como **unidades do app** (hoje o app tem 2). Falta decidir como separar as pessoas
  (o Seu Miyagi hoje aparece como "operação" dentro do Santos). Não será alterado antes de uma decisão explícita.
- **Diretoria = perfil `admin`.** Não cria perfil novo.
- **Regras trabalhistas (noturno, tolerâncias, banco de horas) ficam para depois.** Até lá, todo cálculo é provisório.
- Exemplo de jornada informado para teste (turno do dia): entrada 09:00, saída para intervalo 15:00, retorno 16:00,
  fim 17:20 (6h00 + 1h20 = 7h20, intervalo 1h00, sem horas noturnas).

**Ainda abertas (dependem do Secullum)**
1. Quantos bancos/empresas existem e quais lojas usam cada um.
2. Se há um usuário de API com acesso a todos os bancos ou um por banco.
3. O documento da API (PDF ou Swagger).
4. Batidas do caso noturno da seção 8 (usaremos a variante B se nada for dito).

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
