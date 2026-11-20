# 05 · Arquitetura proposta: BlackPoke XMenu Connector

Proposta para aprovação. **Nada disto foi implementado.** Depende das autorizações e testes de 06 e 08.

## 1. Comparação das estratégias

| Critério | A. Documentada | B. Rotas do portal (HTTP) | C. Navegador automatizado | D. Exportação/importação | E. Híbrida |
|---|---|---|---|---|---|
| Existe para financeiro? | **Não** (a Data API foi excluída pelo dono; não há outra) | Sim [EVIDÊNCIA]: `financeiro/*`, `relatorio/*` | Sim (telas) | Parcial: Excel de relatórios, OFX e XML só de entrada | — |
| Autorização | — | **Precisa de confirmação escrita** da Netcontroll para uso programático | Idem, e automação de tela costuma ser vedada em contrato | Uso normal do produto | Por parte |
| Segurança | — | Boa: só servidor, conta própria, lista fixa de rotas | Média: navegador com sessão, mais superfície | Boa (humano no meio) | Boa |
| Manutenção | — | Média: quebra se o contrato JSON mudar (**migração do portal**) | Alta: quebra a cada mudança visual | Baixa | Média |
| Velocidade | — | Alta (JSON direto) | Baixa (renderiza tela) | Manual | Alta |
| Confiabilidade | — | Alta se houver checagem de contrato | Baixa a média | Alta, mas depende de alguém | Alta |
| Recursos | — | Cabe na Vercel atual | Exige executor com Chromium (fora da Vercel) | Nenhum | Cabe na Vercel |
| Dependência do fornecedor | — | Média | Alta | Baixa | Média |
| Custo de longo prazo | — | **Menor** | Maior | Trabalho humano recorrente | **Menor** |

**Recomendação: E (híbrida), com B como espinha dorsal**, condicionada a três pontos de 08:
(1) autorização escrita da Netcontroll para uso programático do backend do portal,
(2) uma conta de integração com login sem código interativo por SMS/WhatsApp,
(3) confirmação de compatibilidade com o "Novo Portal".

- **B** para todas as leituras (lançamentos, cadastros financeiros, conciliações, relatórios) e, depois de aprovada, para a escrita de despesa.
- **D** como conferência e plano de contingência: Excel do DRE e de relatórios exportado pelo dono quando a leitura automática falhar ou para auditar totais. OFX continua sendo rotina humana dentro do XMenu.
- **C** só se a autorização vier restrita a "uso pela interface" ou se o login exigir passo humano. Nesse caso, sessão iniciada por pessoa e executor separado. Não é recomendado como caminho principal.

## 2. Visão geral

```
            ┌────────────── BlackPoke (Vercel, Next.js) ──────────────────────────────┐
 pg_cron ──►│ POST /api/financeiro/sincronizar   (segredo do agendador ou admin)       │
 (Supabase) │ GET  /api/financeiro/...           (telas, só admin/creator)             │
            │ POST /api/financeiro/escrita       (prévia → confirmação; só creator)    │
            │        │                                                                 │
            │        ▼                                                                 │
            │ src/lib/servidor/financeiroXmenu.ts   orquestra: sessão, loja, banco     │
            │        │                                                                 │
            │        ▼                                                                 │
            │ src/lib/integracoes/xmenuPortal.ts        LEITURA (lista fixa de GET)    │
            │ src/lib/integracoes/xmenuPortalEscrita.ts ESCRITA (conta separada,       │
            │                                           lista fixa de 1–2 operações)   │
            │ src/lib/financeiro/*.ts                   lógica pura testada            │
            └────────┬─────────────────────────────────────────────┬───────────────────┘
                     │ HTTPS, Bearer da LOJA                       │ supabase-js (serviço)
                     ▼                                             ▼
      aws.netcontroll.com.br/{netadm,netweb,netreport}/api/v1   Supabase: fin_* (réplica), auditoria
```

## 3. Componentes

### 3.1 Camada de integração (independente)
- `xmenuPortal.ts`: login, escolha da loja, renovação, `obter(loja, rota, params)`. Aceita **somente** rotas de uma lista fixa (`ROTAS_LEITURA`).
  Devolve tipos internos (`LancamentoFinanceiro`, `PlanoConta`, `CentroCusto`, `ContaFinanceira`, `ConciliacaoCaixa`, `LinhaRelatorio`) definidos em `src/lib/tipos.ts`.
- `xmenuPortalEscrita.ts`: outra conta e outra lista (`ROTAS_ESCRITA`, começando só com "criar despesa"). Nunca exclui, concilia, paga nem mexe em cadastro.
- Nome do arquivo: `xmenuPortal` para não confundir com `xmenu.ts`, que é a Data API excluída deste projeto.

### 3.2 Autenticação
- Credenciais na Vercel (Secret): `XMENU_PORTAL_USUARIO`, `XMENU_PORTAL_SENHA` (leitura); `XMENU_PORTAL_ESCRITA_USUARIO`, `XMENU_PORTAL_ESCRITA_SENHA` (escrita, só na etapa 4).
- Sessão **por loja e por execução**: token do usuário, depois token da loja (`parceiro/login`), guardado só em memória (`cacheCurto`, alguns minutos, chave = loja + conta). Nunca vai para banco, log, resposta ou auditoria.
- Renovação: renova antes de vencer (`account/renew`); em 401, refaz o login **uma** vez. Se falhar de novo, para e registra `NAO_AUTORIZADO`.
- Proibido: contornar código por SMS/WhatsApp, CAPTCHA ou bloqueio. Se o login pedir passo humano, o conector falha com `PRECISA_HUMANO` e avisa o admin.
- Uma loja nunca usa o token de outra. O token fica ligado a `loja.parceiroId` e é conferido na resposta quando houver identificador.

### 3.3 Unidades
- Nova tabela de mapeamento (ver SQL proposto em 07): `xmenu_lojas_portal (id, chave, parceiro_id, nome_portal, unidade_id, empresa, ativa)`.
  Liga parceiro do portal ↔ `unidades` (escala) ↔ `lojas_xmenu` (vendas). Seu Miyagi entra como loja própria.
- Toda linha gravada carrega `loja_id`; consultas consolidadas são feitas no BlackPoke, somando lojas lidas separadamente.

### 3.4 Normalização
- Funções puras `paraLancamento(bruto)`, `paraPlanoConta(bruto)` etc., com testes a partir de **amostras anonimizadas** capturadas no Teste 3.
- Valores em centavos (inteiro) ou `numeric(12,2)`; datas como `date` sem fuso para emissão, vencimento e pagamento; registro do tipo de data usado em cada consulta.
- Descarta dados pessoais: CPF/CNPJ de pessoa física, telefone, endereço. Fornecedor fica com id do XMenu + razão social.

### 3.5 Sincronização (leitura)
- Agendador `pg_cron` (padrão do `11_agendador_vendas.sql`): a cada 30–60 min, os últimos 7 dias por loja; 1×/dia, o mês corrente; 1×/semana, os cadastros financeiros (com `undelete` em mente: registros excluídos somem e devem ser marcados `ativo=false`, não apagados).
- Janela pequena por chamada (1 loja × poucos dias) por causa do limite de 60 s, com pausa entre chamadas.
- Troca atômica por loja + período (como `substituir_vendas_dia`), mais **reconciliação**: total lido × total do relatório 1101/DRE ou do Excel, com alerta de divergência.
- Histórico: completa para trás aos poucos (marco `historico_desde` por loja).

### 3.6 Operações financeiras (escrita, etapa 4)
Mesmo fluxo da escrita no Secullum:
1. **Validação local**: fornecedor e plano de contas **já existentes** (por id, nunca por nome digitado), valor > 0, datas válidas, loja autorizada.
2. **Prévia**: mostra exatamente o que será criado e em qual loja.
3. **Confirmação** explícita do creator.
4. **Chave de idempotência**: `BP-<uuid>` gerado antes do envio, gravado como `pendente` em `xmenu_escritas` e colocado no campo **Histórico** (ou Documento, conforme o Teste 5).
5. **Envio único**, sem repetição automática.
6. **Releitura** do período (`livro-caixa/intervalo`) procurando a chave: achou → `ok` e guarda o id do XMenu; não achou → `nao_confirmado`.
7. Em **timeout ou erro de rede**: **não reenvia**. Fica `incerto`, e um verificador relê nos minutos seguintes. Só um humano decide reenviar, e só depois de a releitura confirmar que nada foi gravado.
8. Uma escrita por vez por loja: trava no banco (`pg_advisory_xact_lock` por loja) ou status `em_andamento` com validade.

### 3.7 Relatórios
- Consulta parametrizada por relatório (rota + parâmetros validados), resultado normalizado em linhas; só os relatórios de prioridade A são guardados.
- DRE: guardar o resultado com o **perfil** e o **tipo de data**; usar como conferência, não como fonte primária.

### 3.8 Resiliência
| Situação | Comportamento |
|---|---|
| Timeout de leitura (20 s) | Repete até 3× com espera crescente; depois registra erro da rodada e segue para a próxima loja |
| 429 / 5xx | Repete respeitando `Retry-After`; pausa global se repetir em várias lojas |
| 401 | Refaz login 1×; depois para |
| Contrato mudou (campo esperado ausente, tipo diferente) | **Para a sincronização daquela rota**, alerta o admin, não grava nada parcial |
| Portal fora do ar | Rodada marcada `erro`; a próxima tenta de novo; tela mostra a "última leitura válida em …" |
| Escrita com resultado incerto | Nunca repete sozinha (ver 3.6) |

### 3.9 Auditoria
Tabela só de acréscimo `xmenu_escritas` (e `xmenu_sincronizacoes` para leituras), com:
origem (`tela`/`agendador`), usuário responsável (`auth.uid()` + nome), loja, horário, tipo de operação, **id de correlação** (o mesmo `BP-<uuid>` da chave),
resultado (`pendente`/`ok`/`erro`/`incerto`/`nao_confirmado`), id do registro no XMenu, resumo **sem** dado pessoal, senha, token nem valores de outras lojas.

### 3.10 Segurança
- Só servidor; rotas exigem admin (leitura) ou creator (escrita). Lista fixa de rotas na integração; host fixo `aws.netcontroll.com.br`.
- Variáveis Secret na Vercel; nada em log (o projeto já não usa `console.*`).
- Diagnóstico `/api/xmenu-portal/diagnostico` no padrão atual: só "respondeu / não respondeu / tempo / motivo".

### 3.11 Evolução
- Novos módulos = nova rota na lista fixa + tradutor puro + teste. A sessão, a resiliência e a auditoria não mudam.
- **Teste de contrato diário**: uma leitura mínima por rota usada, comparando a forma da resposta com a esperada. Pega a migração do portal antes de virar dado errado.
- Se a Netcontroll publicar uma API oficial para financeiro, troca-se só `xmenuPortal.ts` (regra 7 do CLAUDE.md).

## 4. Riscos principais

| Risco | Nível | Mitigação |
|---|---|---|
| Uso do backend interno sem autorização formal | Crítico | Bloqueio até a autorização escrita (08) |
| Login exige código por SMS/WhatsApp | Alto | Conta de integração; se não houver, C com humano iniciando a sessão |
| Migração para o "Novo Portal" muda rotas e campos | Alto | Teste de contrato diário, versão das rotas na lista fixa, conversa com a Netcontroll |
| Lançamento duplicado após timeout | Alto | Chave de idempotência + releitura + sem repetição automática |
| Escrita na loja errada | Alto | Token por loja, loja na prévia, conferência na releitura |
| Efeitos em cascata (fornecedor criado sozinho, juros, DRE) | Médio | Só ids existentes; escrita inicial limitada a despesa sem pagamento |
| Datas em UTC | Médio | Teste específico de limite de dia; datas sem fuso no modelo interno |
| Volume ou limites desconhecidos | Médio | Janelas pequenas, pausas, medição no Teste 4 |
| Dados pessoais em relatórios | Médio | Lista de relatórios proibidos (04) e descarte na tradução |
