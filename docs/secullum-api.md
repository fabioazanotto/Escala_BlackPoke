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

## Formatos reais verificados (diagnóstico rodando na Vercel, 10/11/2026)
Só nomes de campos e contagens; sem dados pessoais, IDs de banco ou CNPJs.

- **Login e banco:** funcionou com `client_id=3`. O cabeçalho `secullumidbancoselecionado` aceitou o **`id` numérico** de `ListarBancos`
  (o `identificador` com hífens não é necessário). A conta enxergou 1 banco.
- **Restrição por empresas** (cadastro do usuário no Secullum) **é respeitada pela API**: `Empresas` devolveu só as empresas liberadas.
  Mesmo assim o adaptador filtra por `EmpresaId` antes de gravar.
- **Empresas:** `Id, Nome, Documento, Inscricao, Endereco, Bairro, Cidade, Cep, Uf, Pais, Telefone, Fax, CEI, NFolhaEmpresa, TipoDocumento,
  ResponsavelNome, ResponsavelCargo, ResponsavelEmail, UtilizaRepC/A/P, Desativada, ConfigEspecificaInclusaoManualPonto`.
- **Funcionarios:** `Id, Nome, NumeroFolha, NumeroIdentificador, NumeroPis, Cpf, Admissao, Demissao (nulo = ativo), EmpresaId + Empresa{}, HorarioId + Horario{},
  DepartamentoId + Departamento{}, FuncaoId + Funcao{}, HorarioAlternativo2Id..4Id, BancoHorasId, Invisivel, DataAlteracao, MotivoDemissaoId, PossuiFoto,
  AceitouTermosLgpdApp` e outros. **O vínculo com a empresa é `EmpresaId`** (não existe `EmpresaCnpjCpf` na resposta). O `GET` devolve também desligados.
  Chave estável do Secullum: `Id` (o mesmo que aparece como `FuncionarioId` nas batidas).
- **Batidas (agrupadas por funcionário e dia):** `Id, FuncionarioId, Data, Entrada1..5, Saida1..5 (texto HH:mm ou nulo), Observacoes, Ajuste, Abono2..4,
  Compensado, AlmocoLivre, Neutro, NBanco, Folga (booleano), Refeicao, MemoriaEntrada1..5, MemoriaSaida1..5 (horários originais), EquipIdEntrada1..5,
  EquipIdSaida1..5, FonteDadosIdEntrada1..5 / FonteDadosIdSaida1..5 e os objetos FonteDadosEntrada1..5 / FonteDadosSaida1..5, Funcionario{}`.
  **Nos campos Entrada/Saida pode vir texto que não é horário: é o nome abreviado de uma justificativa** (ex.: férias). `Folga` é um booleano à parte.
  Ainda não vimos "FALTA" como texto (não havia falta ontem): tratar qualquer texto não horário como justificativa/situação, sem converter em hora.
- **FonteDados (batida a batida):** `Id, Data, Hora, EquipamentoId (pode ser nulo), FuncionarioId, FuncionarioPis, FuncionarioCpf, Tipo, Origem, Motivo, DataInclusao`.
  Em um dia foram vistos `Tipo` 0 (original), 1 (manual) e 3 (desconsiderado). `Origem` 4 (Checkin), 2 (incluído manualmente) e **16, que NÃO está no manual**
  (enumeração mais ampla que a documentada: guardar o número bruto e tratar valores desconhecidos sem quebrar).
- **Leitura incremental:** `FonteDados/APartirDoId?fonteDadosId=N` funcionou (devolve IDs maiores ou iguais).
- **Horarios:** `Id, Numero, Descricao, Desativar, Opcoes, Extras, Descanso, Dias, Ciclos, Dia, FaixasExtras, ColunasEmDias, ToleranciaEspecifica, Tipo, DataBase,
  HorarioIdCopia*`. Cada item de `Dias`: `DiaSemana, Entrada1..5, Saida1..5, TipoEntrada/TipoSaida, Fechamento, ToleranciaExtra, ToleranciaFalta, GrupoDeExtra, Carga,
  TipoDia, Compensado, AlmocoLivre, Neutro, SomarT, Acrescimo, Duracao, Alocar24Horas, HorarioAlternativo`. Existem `Ciclos`, `DataBase` e `Tipo`: **horários podem
  ser cíclicos (rodízio)**, o que muda como a jornada prevista é obtida por data. Conferir no Horario de cada funcionário antes de usar.
- **Funcoes** (21), **Justificativas** (12; campos `Id, NomeAbreviado, NomeCompleto, ValorDia, Ajuste, Abono2..4, LancarComoHorasFalta, NaoAbonarHorasNoturnas,
  DescontarHorasBancoDeHoras, CalcularComoFolga, CalcularHorasAtrasoComoFalta, UsarJustificativaParaContagemDeFerias, Desativar` e outros),
  **Equipamentos** (`Id, Descricao, EnderecoIP`; a conta enxergou 3, um a menos que o total do banco: o restante pertence a empresa não liberada),
  **FuncionariosAfastamentos** (0 nos últimos 30 dias; campos a ver quando houver registros).
- **Tempo de resposta:** cada consulta levou menos de 1 segundo.

## Pontos ainda abertos
- Formato de `Calcular` e se a opção "Não permitir alterações" do usuário o bloqueia (testar na Fase 2).
- Validade do token e limites além do `Calcular`.
- `GET /Pendencias` do manual não existe no Swagger.
- Significado de `Origem = 16` e de `Tipo = 3` em detalhe (ver com o suporte Secullum se for relevante).
- Campos de `FuncionariosAfastamentos` (sem registros para observar).
