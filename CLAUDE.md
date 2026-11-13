# Sistema de escala de funcionários · contexto do projeto

Este projeto é um sistema de escala para um restaurante, criado por um dono de restaurante
sem formação técnica, com ajuda da IA. Leia este arquivo antes de qualquer tarefa.

## O que já existe
- Next.js (App Router, TypeScript, Tailwind) publicado na Vercel a cada push na branch `main`.
- Banco de dados Supabase (Postgres) com as tabelas em `supabase/schema.sql`:
  `funcionarios`, `turnos`, `escalas`, `regras`, `configuracoes`. Já há dados de exemplo.
- Cliente do Supabase em `src/lib/supabase.ts` (usa `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou o nome antigo `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Tipos das tabelas em `src/lib/tipos.ts`; funções de data em `src/lib/datas.ts`.
- Identidade visual (nome, cores, logo) em `src/config/identidade.ts`; menu em `src/config/menu.ts`.
- Layout em painel (sidebar à esquerda de 208 px + barra superior de 64 px) em `src/app/layout.tsx` e `src/components/Estrutura.tsx`.
  Títulos de tela usam `CabecalhoPagina` (título 28/34 e filtros na mesma linha). No celular a sidebar vira gaveta.
  Destinos do menu (Vendas, RH, Configurações), abas, caminho da barra superior e quem pode abrir cada área ficam em `src/config/menu.ts`.
  Perfis: `admin` (tudo, inclusive Vendas), `rh` e `gerencia`. Use `ehRH(perfil)` (`src/lib/acesso.ts`): admin vale como RH.
  A área Vendas é só do admin e vai puxar dados do Xmenu (somente leitura; tokens por loja ficam nas variáveis da Vercel, nunca no código).
  Integração Xmenu (somente leitura, no servidor): `src/lib/integracoes/xmenu.ts`; lojas em `src/config/lojas.ts`; notas da API em `docs/xmenu-api.md`.
  Rota de diagnóstico `/api/xmenu/diagnostico` (só admin) e botão "Testar conexão" em Vendas.
  Banco de vendas (`supabase/escala/09_vendas.sql`): só totais por loja, dia de caixa, turno e canal (`vendas_resumo`), sem dado de cliente; só o admin lê.
  Sincronização: `src/lib/vendas/sincronizar.ts` (lógica, testada) + `src/lib/servidor/sincronizarVendas.ts` (liga ao Xmenu e ao banco) + rota
  `POST /api/vendas/sincronizar` (admin logado ou cabeçalho `x-sincronizar-segredo` vindo do agendador do banco). Reescreve os últimos 3 dias a cada rodada.
  Variáveis na Vercel (Secret): `SUPABASE_SERVICE_ROLE_KEY` e `SINCRONIZAR_SEGREDO`. A chave de serviço só é usada em `src/lib/servidor/supabaseAdmin.ts`.
- Ponto (Secullum Ponto Web, SOMENTE LEITURA, em construção; plano em `docs/plano-ponto-secullum.md`, contrato em `docs/secullum-api.md`):
  cliente em `src/lib/integracoes/secullum.ts` com lista fixa de rotas permitidas (só GET e `Calcular`; escrita é recusada no código),
  rota de diagnóstico `/api/secullum/diagnostico` (só admin; devolve estrutura e contagens, nunca dados pessoais) e tela `/ponto` (aba "Ponto" do RH).
  Variáveis na Vercel (Secret): `SECULLUM_USUARIO` e `SECULLUM_SENHA` (conta própria da integração); `SECULLUM_BANCO_ID` só se a conta enxergar mais de um banco.
  Uma das empresas do banco fica fora do projeto: o adaptador descarta os dados dela antes de gravar.
  Seu Miyagi divide a casa (unidade Santos) para escala e folgas, mas é empresa separada para ponto, admissão e demissão (`ponto_empresas`).
  Sincronização das batidas (somente leitura no Secullum): `src/lib/ponto/sincronizacao.ts` (lógica testada), `src/lib/servidor/sincronizarPonto.ts` e rota `POST /api/ponto/sincronizar`
  (admin logado ou cabeçalho `x-sincronizar-segredo`); SQL em `supabase/escala/14_ponto_marcacoes.sql`. Batida alterada ou removida no Secullum vai para `ponto_marcacoes_historico`; CPF e PIS nunca são guardados.
  Visão ao vivo (aba "Ponto" do RH, só admin): `src/lib/ponto/aoVivo.ts` (classificação testada, parâmetros em `src/config/ponto.ts`), `src/lib/servidor/pontoAoVivo.ts` e rota `GET /api/ponto/ao-vivo`.
  Lê o Secullum na hora (só leitura), por loja, em duas visões ("Escala de hoje" e "Ponto (todos)"). O dia de trabalho só vira às 05:00. Classificação operacional: não gera desconto nem falta oficial.
  Tela "Ponto por colaborador" (`/ponto/colaborador`, só admin): mês de um funcionário (`src/lib/ponto/mes.ts`, `src/lib/servidor/pontoMes.ts`, rotas `GET /api/ponto/colaborador` e `/api/ponto/funcionarios`);
  lê o Secullum na hora e mostra, lado a lado, a leitura do BlackPoke (escala x batidas) e o cálculo oficial (`Calcular`); exporta CSV e imprime. Sem escala no mês, o app NÃO declara faltas.
  O menu do RH fica na barra lateral (subitens em `src/config/menu.ts`); só Configurações ainda usa abas no topo.
  "Ponto por colaborador": escolhe-se a unidade (botões) e aparecem os colaboradores ativos dela como botões; tocar abre o mês.
  Histórico do colaborador (aba "Histórico" em Ponto por colaborador, só admin; tabela `ocorrencias_colaborador`, SQL em `supabase/escala/17_historico_colaborador.sql`; lógica em `src/lib/ponto/historico.ts`):
  faltas e atrasos guardados do mês (botão explícito; só dias escalados e encerrados) e lançamentos manuais (atestado só com datas, nunca CID; advertência; observação). Chave: código do funcionário no Secullum.
  Cartão Ponto (aba "Cartão ponto" em Ponto por colaborador, só admin): cópia no layout do Secullum (A4 paisagem, impressão pelo navegador), feita de `Calcular` + batidas lidas (`src/lib/ponto/cartao.ts`, rota `GET /api/ponto/cartao`).
  Mostra CPF completo e demais dados do cabeçalho lidos na hora (nunca guardados nem em log); C.T.P.S. só sai se o cadastro do Secullum trouxer. Não usa o canal interno de relatórios do Secullum (ver `docs/secullum-api.md`).
  "Creator" (dono do sistema): marcador `app_metadata.creator = true` no login (SQL em `supabase/escala/16_creator.sql`; o usuário não consegue se promover). `useSessao().creator` (admin + marcador).
  RH > "Integração colaboradores" (`/integracao-colaboradores`, kit de boas-vindas por cargo): só o creator vê a página em construção; os demais veem "Em breve".
  A aba "Integração do ponto" (`/ponto-integracao`, em Configurações, só admin) reúne sincronização, conferência de funcionários, teste de conexão e "Nome completo e empresa pelo Secullum"
  (`src/lib/ponto/nomes.ts`, rota `POST /api/ponto/nomes`: mostra o que muda e só grava `colaboradores.nome_completo` e `colaboradores.empresa` depois da confirmação; o nome curto da escala nunca é alterado).
  Conferência de funcionários (aba Integração do ponto, só admin): `src/lib/ponto/conferencia.ts`; vínculos confirmados em `colaborador_ponto_ids` (nunca guarda CPF; desfazer encerra a vigência).
- Motor de escalas (funções puras, com testes: `npm test`) em `src/lib/escala/`. A tela da escala (`src/app/escala-mensal`)
  tem visão em grade e em calendário, com edição direta; componentes em `src/components/escala/`.
  Alterações manuais ficam travadas e são registradas em `escala_alteracoes` (SQL em `supabase/escala/`).
  Regras por unidade (folga fixa, alternância, dobra, dia sem funcionamento) ficam em `regras_unidade`, são criadas só pelo RH em
  `/regras-da-unidade` e aplicadas pelo motor (`src/lib/escala/regras.ts`). Dobra é exceção ao turno fixo e aparece como "Dobra" na escala.
- Usuários (Configurações > Usuários, só admin; `/usuarios`): `src/lib/usuarios.ts` (regras, testadas), `src/lib/servidor/usuarios.ts` e rota `/api/usuarios` (chave de serviço). O admin cria usuário com senha temporária,
  muda perfil/unidades, inativa e redefine senha; a pessoa é obrigada a trocá-la no primeiro acesso (`user_metadata.trocar_senha`, tela em `src/components/TrocarSenha.tsx`).
  Senhas nunca vão para log, auditoria ou resposta da API. O admin não pode se inativar nem rebaixar, e sempre sobra um admin ativo.
- Recordes de vendas (Vendas, só admin): melhor dia de caixa de cada loja em pedidos e em faturamento (`supabase/escala/15_vendas_recordes.sql`, `src/lib/vendas/recordes.ts`).
  A função `vendas_atualizar_recordes` roda depois de cada sincronização das vendas; só recorde dos últimos 3 dias gera alerta (histórico antigo entra em silêncio). O ABC não alerta (`lojas_xmenu.alertar_recordes`).
  Pop-up no login do admin (`src/components/AlertaRecordes.tsx`), faixa verde em Vendas até cada admin dispensar (`FaixaRecordes.tsx`) e 🏆 ao lado de pedidos e faturamento no dia do recorde.
- Classes CSS prontas em `src/app/globals.css`: `.botao`, `.botao-secundario`, `.campo`, `.cartao`.
- Documentação da API de ponto em `docs/api-ponto.md` e dados de exemplo em `docs/marcacoes-exemplo.json`.

## Regras para qualquer mudança
1. Antes de alterar código, apresente um plano curto e espere a aprovação.
2. Tudo em português do Brasil: textos de tela, nomes de variáveis novas, comentários, commits.
3. Mobile first: a tela é usada principalmente no celular. Botões grandes, texto legível,
   nada que dependa de passar o mouse. Use as classes `.botao`, `.campo` e `.cartao`.
4. Não altere `supabase/schema.sql` nem crie tabelas novas sem avisar explicitamente no plano.
   Se precisar de uma coluna nova, explique antes e gere o SQL para o usuário rodar.
5. Não instale dependências novas sem necessidade real. Prefira o que já está no projeto.
6. Nunca escreva chaves, tokens ou senhas no código. Tudo vem de variáveis de ambiente.
   Chamadas a APIs externas com token acontecem no servidor (Route Handlers em `src/app/api`),
   nunca no navegador.
7. Toda integração externa fica em `src/lib/integracoes/`, um arquivo por serviço, devolvendo
   sempre o formato interno do sistema (veja `src/lib/tipos.ts`). Trocar de fornecedor deve
   mexer só nesse arquivo.
8. Cada tela nova entra no menu (`src/config/menu.ts`) e exige login (e-mail e senha, perfis RH e gerência; veja `src/components/Sessao.tsx`).
9. Mantenha o que já funciona. Mudanças pequenas e verificáveis; rode `npm run build` antes do commit.
10. Ao terminar, faça commit com mensagem curta em português e push direto para a branch `main`
    (`git push origin HEAD:main`). Não abra pull request: a Vercel publica o que está na `main`.
11. A API de ponto externa (`PONTO_API_URL`, com `PONTO_CLIENT_ID`, `PONTO_API_KEY` e `PONTO_API_SECRET`) só responde a partir do site publicado na Vercel.
    Não tente chamá-la daqui: a rede deste ambiente não alcança a internet em geral e a falha
    não significa erro no código. Confie em `docs/api-ponto.md` e em `docs/marcacoes-exemplo.json`.

## Como o dono descreve o restaurante
Há dois caminhos, e os dois terminam no mesmo lugar:
- `/comecar` (comando em `.claude/commands/comecar.md`): você entrevista o dono numa única mensagem,
  registra as respostas em `src/config/restaurante.ts` e constrói a Entrega 1 depois do "pode fazer".
- Prompts prontos (pasta `prompts/`): as respostas às quatro perguntas (entrada, regras, saída, quem usa)
  chegam no pedido, entre colchetes.
Se `src/config/restaurante.ts` existir, leia-o antes de qualquer tarefa: ele vale mais que qualquer padrão.
Respeite as regras da casa descritas ali ou no pedido.
