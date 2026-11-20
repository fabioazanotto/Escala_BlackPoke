# 07 · Roadmap de implementação

Cada etapa só começa com aprovação do dono. Tabelas novas e SQL são **propostos** aqui e só serão criados com aviso explícito no plano da etapa (regra 4 do CLAUDE.md).

| Etapa | O quê | Depende de | Prioridade | Concluída quando |
|---|---|---|---|---|
| **0. Autorizações e acesso** | Autorização escrita da Netcontroll; usuário de integração (leitura); captura autenticada (Teste 0); liberar `aws.netcontroll.com.br` na rede da sessão de desenvolvimento, se for preciso | Dono + Netcontroll | Bloqueante | Docs 02–04 com as rotas marcadas [CONFIRMADO]; credenciais na Vercel |
| **1. PoC de leitura** | `xmenuPortal.ts` (login, loja, renovação, lista fixa de GET, erros), rota `/api/xmenu-portal/diagnostico` (só admin, só contagens), testes unitários; Testes 1–4 e 6a–c | Etapa 0 | Alta | Testes 1–4 com totais iguais aos do portal; `npm test` e `npm run build` verdes |
| **2. Réplica financeira** | SQL `19_xmenu_financeiro.sql`: `xmenu_lojas_portal`, `fin_lancamentos`, `fin_planos_conta`, `fin_centros_custo`, `fin_contas`, `xmenu_sincronizacoes` (RLS só admin); sincronização em janela móvel + histórico; agendador `pg_cron` | Etapa 1 | Alta | 3 meses de 4 lojas sincronizados; divergência 0 contra o portal em conferência por amostra |
| **3. Telas e relatórios** | Tela Financeiro (contas a pagar e receber por loja e consolidado, vencimentos da semana, despesas por plano e fornecedor, fluxo previsto × realizado); extração de 504/508/DRE como conferência; alerta de divergência | Etapa 2 | Alta | Dono usa a tela no celular por 2 semanas sem precisar abrir o portal para consultas |
| **4. Escrita controlada** | Autorização de escrita; conta de escrita; `xmenuPortalEscrita.ts` com **uma** operação (criar despesa sem pagamento); `xmenu_escritas` (auditoria só de acréscimo); tela com prévia e confirmação (só creator); Testes 5 e 6d | Etapa 2 + aprovação específica | Média | Teste 5 aprovado e revertido; 10 despesas reais lançadas sem duplicidade, conferidas no portal |
| **5. Automação** | Alertas (vencimentos, recorde de despesa, conciliação de caixa pendente); lançamentos recorrentes **com confirmação**; ampliação gradual da escrita (baixa simples), cada uma com aprovação própria | Etapa 4 | Média | Cada nova operação passou pelo mesmo ciclo PoC → aprovação → modo teste |
| **6. Manutenção contínua** | Teste de contrato diário; painel de saúde (última leitura por loja, erros); revisão a cada versão do portal; plano de migração para o "Novo Portal" | Etapa 1 em diante | Contínua | Mudança de contrato detectada antes de gravar dado errado |

## Fora do escopo até nova decisão
- Excluir lançamentos, conciliar caixa, compensar OFX, alterar ou excluir cadastros, configurar loja ou formas de pagamento, permissões de usuários.
- Qualquer dado de cliente (relatórios de clientes, cupons, mapa de entregas).
- A Xmenu Data API já usada pelo painel de Vendas (excluída por decisão do dono). O painel de Vendas continua como está.

## Estimativa de esforço (ordem de grandeza)
Etapa 1: 1–2 sessões · Etapa 2: 2–3 · Etapa 3: 2–4 · Etapa 4: 2–3 · Etapa 6: contínua (pequena).
