# Conector BlackPoke ↔ XMenu / Netcontroll: diagnóstico

Fase de **diagnóstico** concluída em 20/11/2026. Nada foi implementado e nenhuma operação foi feita no XMenu.

| Documento | Conteúdo |
|---|---|
| [01_DIAGNOSTICO_BLACKPOKE.md](01_DIAGNOSTICO_BLACKPOKE.md) | Stack, padrões reutilizáveis, unidades, credenciais, limitações |
| [02_DIAGNOSTICO_XMENU.md](02_DIAGNOSTICO_XMENU.md) | Arquitetura do portal, autenticação, unidades, permissões, migração para o "Novo Portal" |
| [03_MAPA_FINANCEIRO.md](03_MAPA_FINANCEIRO.md) | Contas a pagar e receber, conciliação, gerencial: campos, rotas observadas, viabilidade |
| [04_MAPA_RELATORIOS.md](04_MAPA_RELATORIOS.md) | 67 relatórios com rota, permissão, prioridade e frequência |
| [05_ARQUITETURA_CONECTOR.md](05_ARQUITETURA_CONECTOR.md) | Comparação das estratégias A–E, arquitetura proposta, idempotência, auditoria, riscos |
| [06_PLANO_PROVA_CONCEITO.md](06_PLANO_PROVA_CONCEITO.md) | Testes 0–6 com pré-requisitos, sucesso, riscos e reversão |
| [07_ROADMAP_IMPLEMENTACAO.md](07_ROADMAP_IMPLEMENTACAO.md) | Etapas 0–6, dependências e critérios de conclusão |
| [08_DUVIDAS_E_BLOQUEIOS.md](08_DUVIDAS_E_BLOQUEIOS.md) | Autorizações, acessos e pontos que exigem pessoa |

## Resumo

- Não há API oficial documentada para o financeiro do XMenu. A Data API já usada no painel de Vendas foi excluída do escopo pelo dono.
- O portal (Angular 9, IIS) conversa com serviços REST em JSON (`aws.netcontroll.com.br/{netadm,netweb,netreport}/api/v1`), com login por usuário, **token por loja** e renovação.
  O financeiro inteiro passa por `financeiro/livro-caixa` (despesas e receitas), mais cadastros (planos, centros de custo, contas, formas) e conciliações.
  Há 67 relatórios em `relatorio/*`. Tudo isso é **evidência do código público, ainda não validada com login.**
- Estratégia recomendada: **híbrida, com as rotas do portal chamadas pelo servidor do BlackPoke** (mesmo padrão da integração do Secullum).
  Exportações Excel ficam como conferência e contingência; navegador automatizado só se a autorização exigir.
  Tudo isso depende de **autorização escrita da Netcontroll**, de um **usuário de integração** sem código por SMS e da confirmação sobre o "Novo Portal".

## Matriz de viabilidade (estado atual das evidências)

| Funcionalidade | Classificação | Base |
|---|---|---|
| Login e token por loja | Depende de autorização ou teste | Fluxo visto no código (02 §3) |
| Listar lojas acessíveis | Depende de autorização ou teste | `GET parceiro` |
| Consultar despesas e receitas (títulos) | Depende de autorização ou teste | `livro-caixa/intervalo` |
| Extrato por conta financeira | Depende de autorização ou teste | `livro-caixa/conta/extrato` |
| Plano de contas, centros de custo, contas, formas de pagamento (leitura) | Depende de autorização ou teste | Rotas `financeiro/*` |
| Conciliações de caixa (leitura) | Depende de autorização ou teste | `conciliacoes/intervalo` |
| Relatórios (dados estruturados) | Depende de autorização ou teste | `relatorio/*` no `NetReport`; formato pendente |
| Relatórios e DRE por Excel exportado pelo dono | **Viável** | Função oficial "Exportar" |
| Fluxo de caixa | Viável com restrições | Não há relatório; o BlackPoke calcula a partir dos lançamentos |
| Comparação entre unidades | Viável com restrições | Multilojas exige licença e matriz; senão, consolida no BlackPoke |
| Cadastrar despesa (sem pagamento) | Depende de autorização ou teste | Manual + `POST livro-caixa`; exige aprovação específica (Teste 5) |
| Baixa / pagamento / liquidação | Depende de autorização ou teste (alto risco) | Manual; rota não confirmada |
| Pagamento parcial | Não viável com as evidências atuais | Comportamento não documentado |
| Cancelar / excluir lançamento | Não viável com as evidências atuais (fora do escopo) | `DELETE` sem restaurar |
| Histórico de alterações de um lançamento | Não viável com as evidências atuais | Não encontrado |
| Anexos (download) | Depende de autorização ou teste | Rota de download vista; envio não visto |
| Conciliação OFX | Viável com restrições (rotina humana no XMenu) | Função oficial "Importar OFX" |
| Conciliação com adquirentes | Viável com restrições | Licença e contrato Conciliadora |
| Cadastro de fornecedores (escrita) | Não viável com as evidências atuais | Rota não vista; criação implícita é risco |
