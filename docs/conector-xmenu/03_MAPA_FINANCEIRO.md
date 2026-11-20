# 03 · Mapa financeiro do XMenu

Base: manual público da retaguarda (campos e regras) + rotas observadas no módulo `financeiro` do código público do portal.
Rotas abaixo são **[EVIDÊNCIA]**: estão no código, mas **nenhuma foi chamada**. Serviço: `NetWeb` (`aws.netcontroll.com.br/netweb/api/v1/`).

## 1. Conceito central: o "Livro Caixa"

- [FATO] Despesas e receitas são registros do financeiro da loja. "As despesas podem ser cadastradas de forma manual ou automaticamente pelas conciliações de caixa"; o mesmo vale para receitas.
- [EVIDÊNCIA] No código não há rotas `despesa` nem `receita` separadas. Telas de Despesas, Receitas e Livro Caixa usam a mesma família de rotas:

| Operação | Rota | Classe |
|---|---|---|
| Listar lançamentos por período | `GET financeiro/livro-caixa/intervalo?DataInicial=…&DataFinal=…&Ordem=n` | Leitura |
| Extrato de uma conta financeira | `GET financeiro/livro-caixa/conta/extrato?IdContaFinanceira=…&DataInicial=…&DataFinal=…&Ordem=n` | Leitura |
| Ler um lançamento | `GET financeiro/livro-caixa/{id}` | Leitura |
| Baixar arquivo/anexo | `GET financeiro/livro-caixa/{id}/download` e `GET financeiro/livro-caixa/arquivo/{id}/download` | Leitura |
| Criar lançamento | `POST financeiro/livro-caixa` | **Criação** |
| Alterar lançamento | `PUT financeiro/livro-caixa` | **Atualização** |
| Excluir lançamento | `DELETE financeiro/livro-caixa/{id}` (sem rota de restaurar) | **Exclusão** [RISCO] |
| OFX: listar / vinculados | `GET financeiro/livro-caixa/ofx`, `GET .../ofx-vinculados` | Leitura |
| OFX: compensar / desvincular | `PUT financeiro/livro-caixa/compensar-ofx`, `PUT .../{id}/desvincular-ofx` | **Atualização** |

- [RISCO] As datas saem do navegador com `toJSON()`, ou seja, em UTC. O projeto já viu esse tipo de problema no Xmenu: data com fuso trazendo o dia seguinte. O conector precisa testar o limite do dia no Teste 3.
- [PENDENTE] O que `Ordem` significa (data de emissão, vencimento ou pagamento?), o formato de cada lançamento, a paginação (não há `limit`/`offset` na chamada: [HIPÓTESE] vem tudo de uma vez) e como se distingue receita de despesa.

## 2. Contas a pagar

| # | Funcionalidade | Local no portal | Obrigatórios / opcionais e regras (manual) | Unidade | Método observado | Viabilidade | Evidência |
|---|---|---|---|---|---|---|---|
| 1 | Consulta de títulos | Financeiro > Despesas; Dashboard > Financeiro (calendário, aberto/compensado) | Filtros: período, aberto/compensado, receita/despesa | Loja do token | `GET livro-caixa/intervalo` | Depende de teste | Código + manual "Dashboard Financeiro" |
| 2 | Cadastro de despesa | Financeiro > Despesas > Novo | **Obrigatórios:** Fornecedor, Plano de Contas, Data Emissão, Valor, Data Vencimento, Histórico. **Opcionais:** Documento, Forma Débito, Conta Financeira, Código de Barras (boleto/PIX), Centro de Custo (com "Ratear proporcional") | Loja do token | `POST livro-caixa` [HIPÓTESE] | Depende de autorização e teste | Manual "Cadastrando novas despesas" |
| 3 | Fornecedores | Cadastros > Fornecedores | Só Razão Social é obrigatória; endereço opcional. **Digitar um nome não cadastrado na despesa cria o fornecedor sozinho** | Loja | Seletor `GET cadastro/selector/fornecedor`; rota de gravação não vista | Leitura: depende de teste. Escrita: não verificada | Manual "Fornecedores", "Conciliação Dinheiro" |
| 4 | Vencimentos | Campo da despesa; calendário do Dashboard | Data Vencimento obrigatória | Loja | Dentro do lançamento | Depende de teste | Manual |
| 5 | Categorias (plano de contas) | Cadastros > Financeiro > Planos de Contas | Descrição, Plano pai (árvore), Tipo (receita/despesa/ambos, só informativo). **Toda receita e despesa precisa de plano** | Loja | `GET/POST/PUT/DELETE financeiro/planos`, `.../undelete/{id}`, `POST .../exportar/xls` | Leitura: depende de teste | Manual + código |
| 6 | Centros de custo | Cadastros > Financeiro > Centro de Custos | Descrição; rateio por valor ou proporcional dentro do lançamento | Loja | `GET/POST/PUT/DELETE financeiro/centro-custo` (+ undelete) | Depende de teste | Manual + código |
| 7 | Parcelamentos | Estoque > Entrada de mercadorias > aba Faturas | "Nº Parcelas" cria **uma despesa por parcela**, cada vencimento editável; só vira despesa ao **Finalizar entrada** | Loja | Módulo de estoque (não analisado) | Não verificado para despesa manual | Manual "Faturas" |
| 8 | Baixa / pagamento | Despesa > botão Pagar; Dashboard > "Liquidar receitas/despesas" (vários de uma vez) | Na baixa, **obrigatórios:** Forma Débito e Conta Financeira (se vazios antes), Data Pagamento, Valor Pago. Juros: Plano de Contas dos juros, Juros %, Valor Juros | Loja | [HIPÓTESE] `PUT livro-caixa` com dados de pagamento | Depende de autorização e teste. **Alto risco** | Manual "Realizando pagamentos" |
| 9 | Pagamento parcial | Despesa > Pagar | "Valor Pago pode ser diferente do valor do documento". Não está documentado se sobra saldo em aberto | Loja | idem | **Não viável com as evidências atuais** (comportamento desconhecido) | Manual |
| 10 | Alteração de título | Despesa > editar | Mesmas regras do cadastro | Loja | `PUT livro-caixa` | Depende de autorização e teste | Código |
| 11 | Cancelamento | Despesa > excluir | Sem "restaurar" para lançamento (os cadastros têm `undelete`) | Loja | `DELETE livro-caixa/{id}` | **Fora do conector** (irreversível) | Código |
| 12 | Histórico de movimentações | — | "Histórico" é um campo de texto livre, não um registro de alterações | — | Nenhuma rota de histórico vista | Não viável com as evidências atuais | Manual + código |
| 13 | Anexos | Lançamento | Existe download de arquivo do lançamento | Loja | `GET livro-caixa/{id}/download`, `.../arquivo/{id}/download`; envio não visto | Leitura: depende de teste | Código |
| 14 | Contas financeiras (bancos/cartões) | Cadastros > Financeiro > Contas Financeiras | Nome, Banco; opcionais: agência, número, telefone, limite | Loja | `GET/POST/PUT/DELETE financeiro/contas` (+ undelete); `GET financeiro/bancos` | Leitura: depende de teste | Manual + código |
| 15 | Forma Débito | Lista fixa | 17 formas fixas (Dinheiro, Boleto, PIX…, Cartão, Débito Automático, Permuta…), sem cadastro de novas | Global | `GET cadastro/selector/forma-debito` | Depende de teste | Manual |

## 3. Contas a receber

| # | Funcionalidade | Local | Campos e regras | Método observado | Viabilidade | Evidência |
|---|---|---|---|---|---|---|
| 1 | Receitas | Financeiro > Receitas | Credor (do cadastro de fornecedores), Data Emissão, Forma de pagamento, Vencimento, Conta Financeira, Plano de contas, Descrição, Documento, Valor, Histórico; Centro de custo opcional. **Vêm preenchidas quando nascem da conciliação de caixa** | `livro-caixa` | Leitura: depende de teste | Manual "Receitas" |
| 2 | Recebimento (baixa) | Receita > Receber | Forma, Conta, Data Pagamento, Valor; abatimentos: Fornecedor da taxa, Plano, Taxa Administrativa %; valor da taxa e valor líquido calculados | [HIPÓTESE] `PUT livro-caixa` | Depende de autorização e teste | Manual "Recebimento" |
| 3 | Recebíveis de cartão | Cadastro da forma de pagamento | **Dias Pgto.** (prazo da adquirente) e **Tx. Desconto** (taxa) alimentam a conciliação | `GET financeiro/formas-pagamento[/completo]` | Depende de teste | Manual "Formas de Pagamento" |
| 4 | Conciliação de caixa | Financeiro > Conciliação de caixa | Por forma: Plano, Data depósito (prazo da receita criada), Conta, Valor Sistema (só leitura), Valor Digitado (só leitura), Valor conciliação, Diferença/Falta; Dinheiro: Saldo e **Sangrias** (cada sangria **cria despesa**) ou "Retirada de caixa" (não cria); Cartões: taxa vira **despesa**; Assinadas e Cortesias só leitura | `GET financeiro/conciliacoes/intervalo?DataInicial&DataFinal&TipoData`, `GET .../{id}`; `PUT conciliacoes/`, `.../abertura`, `.../sangrias` | Leitura: depende de teste. Escrita: **fora do escopo inicial** (cria receitas e despesas em cascata) | Manual + código |
| 5 | Conciliação bancária (OFX) | Receitas, Despesas ou Livro Caixa > "Importar OFX" | Escolher conta, conciliação automática por valor/data/descrição (tolerâncias e pesos configuráveis só por Netcontroll/revenda), "Confirmar" grava o recebimento; "Já processado" desfaz; reimportar retoma de onde parou | `livro-caixa/ofx*`, `compensar-ofx`, `desvincular-ofx` | Viável com restrições **pela tela (D)**, por ser uma rotina humana do próprio XMenu | Doc técnica "Importação OFX" |
| 6 | Conciliação com adquirentes | Licença Conciliadora + Configurações > Loja | Empresa ID e senha **por loja**; marcar "Exportar Vendas"; vincular forma de pagamento a produto/adquirente/modalidade | Fora do portal | Viável com restrições (licença e contrato com a Conciliadora) | Doc técnica |
| 7 | Situação dos recebimentos | Dashboard > Financeiro | Aberto × compensado | `livro-caixa/intervalo` | Depende de teste | Manual |
| 8 | Datas previstas e realizadas | Lançamento | Vencimento × Data Pagamento; depósito previsto pela conciliação | idem | Depende de teste | Manual |
| 9 | Estornos e ajustes | OFX "Já processado"; desvincular | Não há estorno genérico documentado | idem | Não viável com as evidências atuais (fora do OFX) | Doc |

## 4. Informações gerenciais

| Necessidade | O que existe no XMenu | Viabilidade |
|---|---|---|
| Fluxo de caixa | **Não há relatório "fluxo de caixa"**. Existem o calendário do Dashboard Financeiro e o extrato por conta (`livro-caixa/conta/extrato`) | Viável com restrições: o BlackPoke monta o fluxo a partir dos lançamentos lidos |
| Despesas por período, fornecedor e categoria | Relatórios `financeiro-conta-pagar-fornecedor`, `financeiro-conta-pagar-plano`; DRE; Dashboard "Despesas por centro de custo" | Depende de teste; alternativa: agregar no BlackPoke |
| DRE | Relatório 901 configurável (perfis Competência/Vencimento × Compras/Despesas; árvore de linhas por plano de contas; exporta Excel) | Depende de teste; Excel manual é viável já |
| Comparação entre unidades | Relatórios Multilojas 1101 (Despesas) e 1102 (Recebimento), **só na matriz e com licença** | Sem licença: o BlackPoke compara lendo cada loja |
| Vendas | Dezenas de relatórios (ver 04) | Depende de teste |
| Fechamentos | Relatório 54 "Fechamento de Caixa", 508 "Resumo Movimento", conciliações | Depende de teste |
| Cartões e taxas | Taxa na forma de pagamento, taxa na conciliação (vira despesa), Conciliadora | Depende de teste |

## 5. Efeitos em cascata que o conector precisa respeitar

1. Conciliar caixa **cria** receitas (por forma), despesas (sangrias, taxas de cartão) e pode **criar fornecedores** digitados.
2. Finalizar entrada de mercadorias **cria** despesas (uma por parcela) e movimenta estoque.
3. Digitar fornecedor inexistente numa despesa **cria** o fornecedor ([RISCO] duplicidade de cadastro).
4. Pagar com acréscimo cria valor de juros em outro plano de contas.
5. Plano de contas alimenta DRE e Balancete: lançamento em plano errado distorce o gerencial.

Por isso a primeira escrita do conector, quando for aprovada, deve ser **só "lançar despesa manual com fornecedor e plano já existentes, sem pagamento"**. Ficam fora: conciliação, baixa e exclusão.
