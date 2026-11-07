// Tipos que espelham as tabelas do Supabase (veja supabase/schema.sql).

export type Funcionario = {
  id: string;
  nome: string;
  funcao: string;
  telefone: string | null;
  cpf: string | null;
  ativo: boolean;
};

export type Turno = {
  id: string;
  nome: string;
  hora_inicio: string; // "11:00:00"
  hora_fim: string; // "15:30:00"
  ordem: number;
};

export type Escala = {
  id: string;
  data: string; // "2026-11-20"
  turno_id: string;
  funcionario_id: string;
};

export type Regra = {
  id: string;
  dia_semana: number | null; // 0 = domingo ... 6 = sábado; null = todos os dias
  turno_id: string;
  funcao: string;
  minimo: number;
};

export type Configuracao = {
  chave: string;
  valor: string;
};

export const FUNCOES_PADRAO = [
  "Salão",
  "Cozinha",
  "Caixa",
  "Bar",
  "Entregador",
  "Gerência",
];

// ---- Sistema de escalas multiunidade (veja supabase/escala/01_fundacao.sql) ----

export type Unidade = {
  id: string;
  nome: string;
  ativa: boolean;
};

export type PerfilAcesso = "rh" | "gerencia" | "admin";

export type Perfil = {
  id: string;
  nome: string;
  perfil: PerfilAcesso;
  ativo: boolean;
};

export type Funcao = {
  id: string;
  unidade_id: string;
  nome: string;
  operacao: string | null; // ex.: "Seu Miyagi", "BlackPoke"
  ativa: boolean;
};

export type Turno2 = "dia" | "noite";

export type Colaborador = {
  id: string;
  unidade_id: string;
  nome: string;
  cargo: string | null; // como está escrito na planilha ou no RH
  matricula: string | null;
  cpf: string | null;
  telefone: string | null;
  funcao_principal_id: string;
  turno: Turno2;
  data_admissao: string | null;
  data_desligamento: string | null;
  ativo: boolean;
};

export type Jornada = {
  id: string;
  unidade_id: string;
  turno: Turno2;
  hora_inicio: string;
  hora_fim: string; // se <= hora_inicio, termina no dia seguinte
  intervalo_minutos: number;
};

export type Funcionamento = {
  id: string;
  unidade_id: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  dias_semana: number[];
};

export type Cobertura = {
  id: string;
  unidade_id: string;
  turno: Turno2;
  funcao_id: string;
  dia_semana: number | null; // null = todos os dias
  ideal: number;
  minimo_reduzido: number | null; // null = igual ao ideal
};

export type TipoAusencia = "ferias" | "afastamento" | "indisponibilidade";

export type Ausencia = {
  id: string;
  colaborador_id: string;
  tipo: TipoAusencia;
  data_inicio: string;
  data_fim: string;
  motivo: string | null;
};

export type Parametro = {
  id: string;
  unidade_id: string | null;
  tipo: "operacional" | "legal";
  chave: string;
  descricao: string;
  valor: string | null;
  fonte: string | null;
  validado: boolean;
  observacao: string | null;
};

export type Feriado = {
  id: string;
  data: string;
  nome: string;
  unidade_id: string | null;
};

// ---- Vendas (Xmenu) ----

export type CanalVenda = "ifood" | "xmenu" | "balcao" | "outros";

export type PeriodoCaixa = "manha" | "tarde" | "noite";

/** Venda de um caixa fechado, só com o que o painel precisa. Nenhum dado de cliente. */
export type VendaResumida = {
  lojaChave: string;
  saleId: number;
  saleGuid: string;
  dataCaixa: string; // "2026-11-07" (data do caixa)
  periodo: PeriodoCaixa | null;
  canal: CanalVenda;
  entrega: boolean;
  retirada: boolean;
  cancelada: boolean;
  bruto: number; // itens
  desconto: number;
  taxaEntrega: number;
  liquido: number; // total líquido da venda
};
