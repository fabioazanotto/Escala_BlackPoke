# 04 · Mapa dos relatórios do XMenu

Fontes: manual público "Relatórios" (nomes, códigos, regras de cálculo) + módulo `relatorio` do código público do portal (rota no serviço
`NetReport`, `aws.netcontroll.com.br/netreport/api/v1/`, e chave de permissão de cada tela). **Nada foi consultado com login.**

## 1. Regras gerais (manual "Dicas Gerais")

- [FATO] **Período**: atalhos Hoje, Ontem, 7 dias, 30 dias, Este mês, Último mês, Este ano, Último ano, ou datas no calendário.
- [FATO] Grade interativa: arrastar colunas, agrupar, **seletor de colunas** (colunas extras ocultas), filtro por coluna (funil), registros por página (5/10/25/50/100/todos).
- [FATO] **"Exportar todos os dados"** baixa um arquivo Excel. [EVIDÊNCIA] O Excel é montado **no navegador**, a partir dos dados que a tela recebeu.
- [HIPÓTESE] Por isso cada relatório recebe os **dados estruturados** (JSON) do `NetReport`, e não um PDF pronto. Extrair esses dados é mais confiável que ler PDF ou planilha. [PENDENTE] Confirmar o formato na captura autenticada: o serviço que busca os dados fica num módulo compartilhado ainda não observado.
- [FATO] Pedidos de **relatório novo** à Netcontroll exigem uma planilha-modelo; sem ela, o pedido é negado.
- [FATO] Relatórios de movimento contam pela **data de abertura do caixa** e só depois do fechamento (ex.: 508).
- [FATO] Relatórios Multilojas (1101–1104) exigem a licença **Multilojas** e só aparecem na loja **matriz**, filtrados por "Agrupador de lojas".

Legenda: **Cód.** = código citado no manual (o portal usa 3 ou 4 dígitos: categoria + sequência; códigos de 2 dígitos no manual são títulos antigos) ·
**Prior.** = prioridade para o BlackPoke (A alta, M média, B baixa) · **Freq.** = atualização recomendada.
Todos: consulta programática = **depende de autorização e teste**; exportação Excel manual = **viável** (salvo nota).

## 2. Financeiro (09)

| Cód. | Nome | Rota `relatorio/…` | Permissão `NetWeb.Relatorio.…` | Parâmetros conhecidos | Prior. | Freq. | Tratamento |
|---|---|---|---|---|---|---|---|
| 901 | DRE (Demonstração do Resultado) | `perfil-dre` | `DemonstrativoResultados` | Período; Perfil (Competência/Vencimento × Compras/Despesas); linhas configuráveis por plano de contas, tipo de data (Registro/Emissão/Vencimento/Pagamento) e tipo de valor (Original/Pago/Líquido) | A | Diária (fechado: mensal) | Guardar o **perfil usado** junto do resultado; perfis diferentes dão números diferentes |
| 902 | Balancete | `balancete` | `Balancete` | Período [PENDENTE] | M | Mensal | — |
| 903 | Forma de Pagamento | `financeiro-forma-pagamento` | `FinanceiroFormaPagamento` | [PENDENTE] | M | Diária | — |
| — | Contas a pagar por fornecedor | `financeiro-conta-pagar-fornecedor` | `FinanceiroDespesasPorFornecedor` | [PENDENTE] | A | Diária | Pode ser substituído por agregação dos lançamentos lidos |
| — | Contas a pagar por plano | `financeiro-conta-pagar-plano` | `FinanceiroDespesasPorPlano` | [PENDENTE] | A | Diária | idem |

## 3. Movimento / caixa (05)

| Cód. | Nome | Rota | Permissão | Prior. | Freq. | Observação |
|---|---|---|---|---|---|---|
| 501 | Cortesias por período | `cortesia` | `Cortesia` | M | Diária | |
| 502 | Descontos por período | `desconto` | `Descontos` | M | Diária | |
| 503 | Descontos por cupom | `desconto-cupom` | `DescontosCupons` | B | Sob demanda | |
| 504 | Fechamento de Caixa | `fechamento-caixa` | `FechamentoCaixa` | A | Diária | Base para conferir conciliação |
| 505 | Sangrias por período | `sangria` | `Sangrias` | A | Diária | Sangria vira despesa na conciliação |
| 506 | Visualiza Cupons | `visualiza-cupom` | `VisualizaCupons` | B | Sob demanda | Contém dados de cliente: **não importar** |
| 507 | Zera Caixa | `zera-caixa` | `ZeraCaixas` | B | Sob demanda | Leitura apenas; nome sugere operação sensível: [PENDENTE] confirmar que é só relatório |
| 508 | Resumo Movimento | `resumo-movimento` | `ResumoMovimentos` | A | Diária | 4 blocos (ticket médio, produtos, recebimentos, diferença); conta pela data de **abertura** do caixa |
| 59 | Movimento de mesas | `transferencia-mesa` / `mesa-sem-servico` [HIPÓTESE] | `TrasnferenciasMesas` / `MesasSemServico` | B | — | |

## 4. Recebimento (02)

| Cód. | Nome | Rota | Permissão | Prior. | Freq. |
|---|---|---|---|---|---|
| 21 | Recebimento por Cliente | `faturamento-cliente-periodo` | `FaturamentoClientesPeriodo` | B (dados de cliente) | — |
| 22 | Recebimento por Período | `faturamento-periodo` | `FaturamentoPeriodo` | A | Diária |
| 203 | Tela/Vendas | `faturamento-setor` | `FaturamentoSetor` | M | Diária |
| 24 | Recebimento por Mesa e Pessoas | `faturamento-mesa-pessoa` | `FaturamentoMesaPessoa` | B | — |
| 205 | Recebimento por Forma de Pagamento | `faturamento-forma-pagamento` | `FaturamentoFormaPagamento` | A | Diária |
| 26 | Cupons Recebidos | `cupom-recebido` | `CuponsRecebidos` | B | — |

## 5. Vendas e produtos (01)

| Cód. | Nome | Rota | Permissão | Prior. |
|---|---|---|---|---|
| 101 | Vendas por Produtos | `venda-produto` | `VendasProdutos` | M |
| 102 | Vendas por Emissor Fiscal | `venda-emissor-fiscal` | `VendasEmissorFiscal` | B |
| 103 | Vendas de Produtos por setor | `venda-produto-setor` | `VendasProdutosSetor` | B |
| 104 | Vendas de Produtos por terminal | `venda-produto-terminal` | `VendasProdutosTerminais` | B |
| 105 | Vendas de Produtos por atendente | `venda-produto-atendente` | `VendasProdutosAtendentes` | B |
| 106 | Vendas atendente × autoatendimento | `venda-autoatendimento` | `VendasAutoatendimento` | B |
| 107 | Vendas de Produtos por hora | `venda-produto-hora` | `VendasProdutosHoras` | B |
| 108 | Vendas por Emissor Fiscal por Forma de Pagamento | `venda-emissor-fiscal-forma-pagamento` | (mesma família) | B |
| — | Vendas produtos dado bruto | `venda-produto-dado-bruto` | `VendasProdutosDadosBrutos` | M (dado mais granular) |
| — | Produtos não vendidos | `venda-produto-nao-vendido` | `NaoVendidosProdutos` | B |
| — | Vendas produtos dia a dia | `venda/produto/dia-dia` | `VendasProdutosDiaDia` | M |
| — | Vendas por origem de atendimento | `venda-origem-atendimento` | `VendasOrigemAtendimento` | M |
| — | Ticket médio por atendente | `ticket-medio-atendente` | `TicketMedioAtendentes` | B |
| — | Venda royalties | `venda-royalt` | `VendaRoyalt` | B |
| — | CMV real por produto | `cmv-real-produto` | `CmvRealProduto` | M |

## 6. Estoque (03)

| Cód. | Nome | Rota | Permissão | Prior. |
|---|---|---|---|---|
| 31 | Entrada de Mercadorias | `entrada-mercadoria-periodo` | `EntradasMercadoriaPeriodo` | A (gera despesas) |
| 32 | Listagem de Estoque | `listagem-estoque` | `ListagemEstoque` | M |
| 33 | Listagem de Reposição | `listagem-estoque-reposicao` | (família Listagem) | M |
| 34 | Listagem de Produções | `listagem-producao` | `ListagemProducoes` | B |
| 35 | Listagem de Composições | `listagem-composicao` | `ListagemComposicoes` | B |
| 36 | Listagem de Classificação Fiscal | `listagem-produto-fiscal` | `ListagemClassificacoesFiscais` | B |
| — | Listagem CMV de produtos | `listagem-cmv-produto` | `ListagemCmvProdutos` | M |
| — | Manipulações por período | `manipulacao-periodo` | `ManipulacoesPeriodo` | B |

## 7. Comissões (04), Entregas (06), Clientes (07), Segurança (08), Fiscal (10)

| Cód. | Nome | Rota | Permissão | Prior. | Nota |
|---|---|---|---|---|---|
| 41 | Comissões de Vendas | `comissao` | `Comissoes` | M | |
| 42 | Comissões por Período | `comissao-venda-periodo` | `ComissoesVendaPeriodo` | M | |
| 43 | Taxas Entregadores | `taxa-entregador` | `TaxaEntregadores` | M | Custo de entrega |
| 61 | Tempo de entregas | `entrega-tempo` | `TempoEntregas` | B | |
| 62 | Entregas por bairro | `entrega-bairro` | `EntregasBairros` | B | Endereço agregado |
| 63 | Pedidos de Entrega (iFood) | `entrega-pedido` | `EntregasPedidos` | M | |
| 64 | Entregas por Entregador | `entrega-entregador` | `EntregasEntregador` | B | |
| 605 | Entregas por Origem | `entrega-pedido-origem` | `EntregasPedidosOrigem` | M | |
| — | Mapa de calor de entregas | `entrega-mapa-calor` | `EntregasMapaCalor` | B | Localização: **não importar** |
| 71/72 | Assinadas extrato/saldo | `asinadas-extrato`, `assinadas-saldo` | `AssinadasExtrato`, `AssinadasSaldo` | B | Dado de cliente |
| 73/74 | Clientes inativos/aniversários | `cliente-inativo`, `cliente-aniversario` | `ClientesInativos`, `ClientesAniversarios` | — | **Não importar** (dado pessoal) |
| — | Avaliações autoatendimento | `autoatendimento-avaliacoes` | `AutoatendimentoAvaliacao` | B | |
| 801 | Cupons Cancelados | `cupom-cancelado` | (família) | M | Controle de perdas |
| 802 | Itens Cancelados | `item-cancelado` | `ItemCancelado` | M | |
| 1001 | Arquivos Fiscais (XML) | `arquivo-fiscal` | `ArquivosFiscais` | B | XML pode ter dados de cliente |
| — | SPED | `fiscal/sped` | `SPED` | B | Arquivo para contador |
| — | Registros fiscais entradas/saídas | `entrada-cfop`, `venda-cfop` | `RegistrosFiscaisEntradas/Saidas` | B | |

## 8. Multilojas (11). Exige licença e loja matriz

| Cód. | Nome | Rota | Permissão | Prior. |
|---|---|---|---|---|
| 1101 | Multilojas Despesas | `multiloja-despesa` | `MultilojasDespesas` | A (se houver licença) |
| 1102 | Multilojas Recebimento | `multiloja-recebimento` | `MultilojasRecebimentos` | A (idem) |
| 1103 | Multilojas Vendas Produtos | `multiloja-venda-produto` | `MultilojasVendasProdutos` | M |
| 1104 | Produtos × Loja (vínculos) | `multiloja-produto-loja` | `MultilojasProdutosLojas` | B |
| — | Multilojas venda diária | `multiloja-venda-diaria` | `MultilojasVendasDiarias` | M |
| — | Multilojas venda por grupo/fornecedor | `multiloja-venda-grupo-fornecedor` | `MultilojasVendasGrupoFornecedor` | B |

## 9. Volume, frequência e armazenamento

- [PENDENTE] Volumes e limites só podem ser medidos com login (Teste 4 do plano).
- Recomendação: **guardar no BlackPoke só agregados ou lançamentos financeiros**, nunca dado de cliente. A cópia local é **réplica analítica** com data e hora da leitura e a origem; o XMenu continua sendo a base oficial.
- Janela móvel: reler os **últimos 7 dias** a cada rodada e o **mês corrente** uma vez por dia, porque lançamentos e conciliações mudam depois do fato. Meses fechados: reler uma vez por semana até o fechamento contábil e depois congelar, com conferência mensal de totais.
- Prioridade de extração: (1) lançamentos do livro-caixa, (2) cadastros financeiros (planos, centros, contas, formas), (3) 504/505/508 para conferência de caixa, (4) DRE apenas como **conferência** do que o BlackPoke calcula a partir dos lançamentos.
