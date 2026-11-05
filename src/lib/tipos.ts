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

export type PerfilAcesso = "rh" | "gerencia";

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
