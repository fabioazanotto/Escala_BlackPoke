# Xmenu Data API: o que descobrimos (somente leitura)

Sem dados pessoais nem tokens. Os tokens ficam só nas variáveis de ambiente da Vercel
(`XMENU_API_URL` e `XMENU_TOKEN_PG`, `_SANTOS`, `_MIYAGI`, `_ABC`). Os códigos das lojas estão em `src/config/lojas.ts`.

## API
- 42 endpoints, todos `GET`, versão v2, caminho `/v2/stores/{storeId}/...`.
- Autenticação: cabeçalho `Authorization: Bearer {token}`; um token por loja.
- Respostas: `{ data, pagination: { limit, offset, returned, hasMore }, meta }`.
- A documentação não informa limite de chamadas.

## O que vale para o painel de vendas
- **Valor e canal só existem em `cash-registers/closed-sales`** (caixas fechados). A data base é a **data do caixa**
  (`register.cashDate`). Cada turno (manhã, tarde, noite) é um caixa; as vendas entram quando o caixa fecha.
- **iFood não é um canal.** O canal só distingue `delivery` e `counter` (balcão). O iFood aparece como entrega com
  `delivery.marketplaceOrderId` preenchido. Regra do app: iFood = entrega com código; Xmenu = entrega sem código; balcão.
- **`/sales` (ao vivo) não serve para faturamento:** traz só id, código externo (= GUID da venda), hora, total e status;
  não traz canal; os totais não batem com os do caixa fechado e o status vem sempre `open`.
- **A hora das vendas de delivery não é a hora do pedido:** pedidos do iFood foram registrados em lote (dezenas de
  vendas no mesmo minuto, no fechamento). Análise por hora seria enganosa; por turno (período do caixa) é confiável.
- Itens e pagamentos vêm pelo parâmetro `include` (valores não documentados; testar antes de usar).
- Cada venda traz dados de cliente (nome, telefone, endereço). O app descarta tudo isso na tradução
  (`src/lib/integracoes/xmenu.ts`) e não guarda nada.
