# 01 · Diagnóstico do aplicativo BlackPoke

Investigação feita em 20/11/2026 lendo o repositório (commit `f4e5d2b`). Nada foi alterado no código.

Legenda usada em todos os documentos desta pasta:
**[FATO]** confirmado no código ou em fonte oficial · **[EVIDÊNCIA]** observado, mas não validado em uso real ·
**[HIPÓTESE]** dedução técnica a confirmar · **[RISCO]** · **[PENDENTE]** depende de alguém.

## 1. Stack encontrada

| Item | O que existe | Onde |
|---|---|---|
| Linguagem | TypeScript (front e servidor) e SQL (Postgres) | `src/`, `supabase/escala/` |
| Frontend | Next.js 16.4 (App Router) + React 19.3 + Tailwind 4; classes prontas `.botao`, `.campo`, `.cartao` | `src/app`, `src/app/globals.css` |
| Backend | Route Handlers do próprio Next.js (`src/app/api/**/route.ts`), rodando como funções da Vercel (`maxDuration` até 60 s) | `src/app/api` |
| Banco | Supabase (Postgres) com RLS em todas as tabelas novas; funções `eh_rh()`, `eh_admin()`, `pode_unidade()` | `supabase/escala/01..18_*.sql` |
| Agendador | `pg_cron` + `pg_net` no Supabase chamando rotas do app com cabeçalho secreto `x-sincronizar-segredo` (segredo no Vault) | `supabase/escala/11_agendador_vendas.sql` |
| Testes | Vitest (`npm test`), lógica pura testada separada da orquestração | `*.test.ts` |
| Dependências | Só 5 de produção (`next`, `react`, `react-dom`, `@supabase/supabase-js`, `read-excel-file`) | `package.json` |
| Hospedagem | Vercel, deploy automático a cada push na `main` | `CLAUDE.md` |

[FATO] Não há Playwright, Puppeteer nem fila (BullMQ, SQS etc.) no projeto. Navegador automatizado ou fila exigiriam dependência e, provavelmente, infraestrutura nova (ver 05).

## 2. Autenticação e perfis

- [FATO] Login por e-mail e senha no Supabase Auth (`src/components/Sessao.tsx`). Perfis: `admin`, `rh`, `gerencia` (tabela `perfis`); `ehRH()` trata admin como RH.
- [FATO] Marcador "creator" (`app_metadata.creator`), que o usuário não consegue se dar sozinho. Hoje ele libera telas em construção e a escrita no Secullum.
- [FATO] Rotas de servidor conferem quem chama com `chamadorDaRequisicao()` (`src/lib/servidor/admin.ts`): valida o JWT e lê o perfil ativo.
- [FATO] Rotas automáticas aceitam o segredo do agendador em vez de usuário (`POST /api/vendas/sincronizar`, `POST /api/ponto/sincronizar`), comparado com `timingSafeEqual`.

## 3. Organização dos módulos

```
src/config/        parâmetros e listas fixas (lojas, menu, ponto, escrita)
src/lib/integracoes/  UM arquivo por serviço externo, devolve formato interno (regra 7 do CLAUDE.md)
src/lib/<domínio>/    lógica pura e testada (vendas, ponto, escala)
src/lib/servidor/     orquestração: liga integração + banco (só servidor)
src/app/api/          rotas: autenticam, chamam servidor/, respondem sem dados sensíveis
src/components/       telas
```

## 4. Integrações existentes

| Serviço | Tipo | Arquivos | Observação para o conector |
|---|---|---|---|
| Xmenu Data API (v2, token por loja) | Leitura de vendas | `src/lib/integracoes/xmenu.ts`, `docs/xmenu-api.md` | **Fora do escopo por decisão do dono (20/11/2026: "esqueça a api pré-existente").** Não é base do conector. Continua funcionando para o painel de Vendas. |
| Secullum Ponto Web | Leitura + escrita controlada | `secullum.ts`, `secullumEscrita.ts`, `src/lib/servidor/pontoEscrita.ts` | **Modelo de referência** para escrita: conta separada, lista fixa de operações, prévia → confirmação → grava → relê → auditoria. |

[FATO] Não existe módulo financeiro (contas a pagar/receber, plano de contas, DRE) nem módulo de relatórios do Xmenu no BlackPoke. Não há nada para reaproveitar além dos padrões abaixo.

## 5. Padrões de arquitetura que o conector deve reutilizar

1. **Cliente HTTP com códigos de erro próprios**: `ErroXmenu`/`ErroSecullum` com `NAO_AUTORIZADO`, `LIMITE_DE_CHAMADAS`, `TEMPO_ESGOTADO` etc. Repete só em 429/5xx/rede, com espera dobrando e respeitando `Retry-After`.
2. **Injeção de dependências para teste** (`env`, `fetchFn`, `tentativas`, `tempoLimiteMs`), o que permite testar sem rede.
3. **Lista fixa de rotas permitidas** (`ROTAS_ESCRITA` em `secullumEscrita.ts`): qualquer outra é recusada antes da chamada.
4. **Conta de integração separada para escrita**, com variáveis próprias na Vercel.
5. **Escrita em 5 passos** com releitura para conferir e auditoria só de acréscimo (`secullum_escritas`, sem CPF nem senha).
6. **Sincronização em janela móvel**: reescreve os últimos N dias a cada rodada e completa o histórico aos poucos (`lojas_xmenu.historico_desde`), com registro em `sincronizacoes`.
7. **Cache curto em memória** (`src/lib/servidor/cacheCurto.ts`).
8. **Diagnóstico sem dados**: rotas `/api/*/diagnostico` só dizem se respondeu, quanto demorou e o motivo do erro.

## 6. Logs e auditoria

- [FATO] Não há `console.log/error` nas rotas, no servidor nem nas integrações (0 ocorrências). Não existe log central; o que fica registrado está em tabelas.
- [FATO] Auditoria genérica por gatilho (`auditoria`: antes/depois em JSON) nas tabelas de cadastro, mais auditorias específicas: `escala_alteracoes`, `sincronizacoes`, `ponto_sincronizacoes`, `secullum_escritas`.
- [RISCO] O gatilho genérico grava a linha inteira em `antes/depois`. Uma tabela financeira com esse gatilho duplicaria valores e dados de fornecedor na auditoria. O conector deve ter auditoria própria e enxuta.

## 7. Modelagem de unidades

- [FATO] `unidades` (escala/RH) e `lojas_xmenu` (vendas) são tabelas **separadas e sem ligação** entre si. `ponto_empresas.unidade_id` liga o Secullum às unidades.
- [FATO] Lojas do Xmenu cadastradas: Praia Grande (20210), Santos (20211), Seu Miyagi Sushi (20773), ABC (22010) (`src/config/lojas.ts`).
- [FATO] Seu Miyagi divide a unidade Santos na escala, mas é **empresa separada** (CLAUDE.md). Financeiro e fiscal devem tratá-lo como loja própria.
- [HIPÓTESE] O identificador da loja no portal ("parceiro") pode ser o mesmo número usado hoje (20210…). Confirmar no Teste 2 do plano (06).

## 8. Credenciais e variáveis

- [FATO] Todas as chaves ficam em variáveis da Vercel (Secret): `SUPABASE_SERVICE_ROLE_KEY`, `SINCRONIZAR_SEGREDO`, `XMENU_*`, `SECULLUM_*`, `SECULLUM_ESCRITA_*`. A chave de serviço do banco só é usada em `src/lib/servidor/supabaseAdmin.ts`.
- [FATO] Não há arquivo `.env` versionado nem segredo no código.

## 9. Limitações do ambiente atual

| Limitação | Efeito no conector |
|---|---|
| Funções da Vercel com tempo máximo (60 s configurado) e sem estado entre chamadas | Sessão do portal não sobrevive entre chamadas: o login acontece a cada rodada, ou o token fica num cache curto. Cargas grandes precisam ser fatiadas (como já se faz em vendas). |
| Sem navegador automatizado no projeto | A Estratégia C (Playwright) não roda na Vercel como está; exigiria um executor separado. |
| Ambiente de desenvolvimento (esta sessão) com rede restrita | `portal.netcontroll.com.br` e `netcontroll.gitbook.io` foram liberados em 20/11/2026. O servidor de dados (`aws.netcontroll.com.br`) **não** está liberado. |
| Sem computador do dono conectado a esta sessão | Não há como abrir o portal logado daqui (ver 08). |
| Sem ambiente de homologação próprio (Supabase e Vercel únicos) | Testes de escrita devem usar registros de teste marcados e reversíveis (ver 06). |
