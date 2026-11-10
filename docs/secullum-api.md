# API do Secullum Ponto Web: contrato verificado

Fontes: manual oficial "Integração Ponto Web" (80 páginas, set/2026), Swagger oficial
(`pontowebintegracaoexterna.secullum.com.br/docs/`) e o exemplo em C# da própria Secullum (repositório
`Secullum/PontoWebIntegracaoExternaExemplo`). Conferido por leitura da documentação, **ainda não testado
contra a API real** (a rede de desenvolvimento não a alcança; só o site na Vercel).
Sem dados pessoais nem segredos: este arquivo está num repositório público (por isso não traz IDs de banco nem CNPJs).

## Requisitos para a integração funcionar
- Plano PRO ou superior, TLS 1.2+.
- Em Manutenções > Integração com Sistemas: "Habilitar integração externa" marcado **e** o usuário que vai conectar
  marcado em "Usuários autorizados a conectar neste banco de dados".
- A consulta de **Funcionários** exige autorização do administrador para dados protegidos pela LGPD.

## Autenticação
1. `POST https://autenticador.secullum.com.br/Token`, `application/x-www-form-urlencoded`:
   `grant_type=password`, `username` (e-mail da Conta Secullum), `password`, `client_id=3` (valor fixo, Ponto Web).
   Resposta: `{ "access_token": "..." }`. **Validade do token: não documentada** (tratar 401 com uma reautenticação).
2. Opcional: `POST /ReinvidicacoesToken` (`token=<access_token>`) devolve email, nome, revendaId.
3. `GET https://autenticador.secullum.com.br/ContasSecullumExterno/ListarBancos` com `Authorization: Bearer`.
   Cada banco traz `id`, `identificador`, `nome`, `plano`, `limitePessoas`, `quantidadeEquipamentos` etc.
4. API: base `https://pontowebintegracaoexterna.secullum.com.br/IntegracaoExterna/`.
   Cabeçalhos: `Authorization: Bearer <token>` e `secullumidbancoselecionado: <id do banco>`
   (o exemplo da Secullum também manda `Accept-Language: pt-BR`).
   Divergência: o Swagger diz "usar o id do banco" (numérico); o manual diz que, se o identificador tiver "-", deve
   ir só com letras e números. A conferir no diagnóstico (usar o `id` de `ListarBancos`).
5. Erro de validação: HTTP 400 com lista `[{ "Property", "Message" }]`.

## Limites documentados
- `Calcular` e `Calcular/SomenteTotais`: período de no máximo 1 mês e **100 requisições por hora por banco**.
- `FonteDados/APartirDoId`: até 5.000 registros por chamada; para mais, paginar pelo último ID.
- Período máximo de `Batidas` e limite geral de chamadas: **não documentados** (não inventar).

## Recursos que o BlackPoke vai usar (somente leitura)
| Recurso | Uso |
|---|---|
| `GET /Empresas` | Empresas do banco (chave: `Documento`). Liga unidade do app a empresa do Secullum. |
| `GET /Departamentos`, `/Funcoes`, `/Justificativas`, `/Equipamentos` | Cadastros de apoio (somente leitura). |
| `GET /Funcionarios` (e `/Funcionarios/Cpf?cpf=`) | Lista de funcionários: Nome, NumeroFolha, Cpf, NumeroPis, NumeroIdentificador, Admissao, Demissao, EmpresaCnpjCpf, HorarioNumero, DepartamentoDescricao, FuncaoDescricao. |
| `GET /Horarios` | Horário previsto de cada funcionário: por dia da semana, Entrada1..5/Saida1..5, TipoDia (Normal/Extra/Folga), Carga, tolerâncias, Compensado, regras de extras, DSR e adicional noturno. |
| `GET /FonteDados` e `/FonteDados/APartirDoId` | **Cada batida individual**: Id, FuncionarioId, FuncionarioPis, FuncionarioCpf, EquipamentoId, Data, DataInclusao, Hora, Tipo, Origem. |
| `GET /Batidas` | Batidas por período (filtros DataInicio, DataFim, HoraInicio, HoraFim, FuncionarioPis, FuncionarioCpf, EmpresaDocumento). **Formato da resposta não está no manual nem no Swagger**: descobrir no diagnóstico (só a estrutura). |
| `GET /FuncionariosAfastamentos` | Afastamentos: NumeroPis, Cpf, Inicio, Fim, Motivo, JustificativaNome. |
| `POST /Calcular`, `/Calcular/SomenteTotais` | **Consulta** (não grava) dos cálculos oficiais: `{ Colunas, Linhas[{Key, Value[]}], Totais }`. Serve para reconciliar o nosso cálculo com o do Secullum. Limites acima. |

Enumerações de `FonteDados`: **Tipo** Original 0, Manual 1, PreAssinalado 2, Desconsiderado 3.
**Origem** Desconhecido 0, RelogioPonto 1, IncluidoManualmente 2, PreAssinalado 3, Checkin 4, CentralFuncionarioWeb 5,
CentralFuncionarioApp 6, CentralFuncionarioAppOffline 7, IntegracaoExterna 8.

## Estratégia que o contrato permite
- **Sincronização incremental de batidas:** `FonteDados/APartirDoId` com o último ID já guardado (cursor por banco,
  até 5.000 por chamada). `DataInclusao` mostra batidas recebidas com atraso. `Tipo = Desconsiderado` indica batida anulada.
- **Reprocesso de dias recentes:** `FonteDados` ou `Batidas` por período, para pegar alterações retroativas.
- **Reconciliação:** `Calcular/SomenteTotais` por funcionário e mês, no máximo 100 chamadas por hora (planejar em lotes).
- **Jornada prevista no Secullum:** `Funcionarios.HorarioNumero` + `Horarios` (dia da semana).

## Rotas de ESCRITA (NÃO serão usadas na primeira versão)
POST e DELETE de Empresas, Horarios, Funcoes, Departamentos, Funcionarios, Afastamentos, Justificativas, etc.;
`CartaoPonto/*` (Manual, Justificativa, Troca, TrocaDia, DELETE), `InclusaoPonto/Incluir`, `Pendencias` (tabela
especial), `GestaoArquivos` e `GravarLogsIniciarBkp`. O cliente do BlackPoke terá uma **lista fixa de rotas permitidas
(só GET e `Calcular`)**: qualquer outra rota é recusada no código, mesmo por engano.

## Pontos ainda abertos
- Formato da resposta de `/Batidas` e de `/Funcionarios` (campos exatos, como aparecem FOLGA e FALTA): ver no diagnóstico.
- Validade do token e limites além do `Calcular`.
- `GET /Pendencias` do manual não existe no Swagger.
- Qual conta Secullum será usada pela integração (precisa estar autorizada no banco).
