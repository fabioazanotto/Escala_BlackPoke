// Cartão Ponto no padrão do Secullum (conferência e impressão). Funções puras (testadas).
// Os valores vêm do cálculo oficial (Calcular) e das batidas lidas do Secullum; aqui só se organiza o que já foi lido.
// Não é o documento assinado do Secullum: é uma cópia para conferência.

import { valorDoCampo } from "@/lib/integracoes/secullum";
import type { DiaMes } from "./mes";
import type { MesDoColaborador } from "./mesTipos";

export type HorarioDoDia = { dia: string; horas: string[] }; // horas: Ent.1, Saí.1, Ent.2, Saí.2, Ent.3, Saí.3

export type CabecalhoCartao = {
  empresaNome: string;
  cnpj: string;
  inscricao: string;
  departamento: string;
  funcao: string;
  nome: string;
  admissao: string | null; // yyyy-mm-dd
  cpf: string; // formatado; só trafega para o admin e nunca é guardado
  ctps: string; // o Secullum só entrega se o cadastro tiver; senão fica em branco
  numeroFolha: string;
  responsavelCargo: string;
  horarioTrabalho: HorarioDoDia[] | null; // null: horário cíclico/rodízio ou não encontrado
};

export type LinhaCartao = {
  dia: string;
  rotulo: string; // 01/09/2026 - Ter
  celulas: [string, string, string, string]; // Entrada 1, Saída 1, Entrada 2, Saída 2
  normais: string;
  faltas: string;
  extras: string;
  dsr: string;
  carga: string;
  notTot: string;
};

const texto = (x: unknown) => (typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "");
const soDigitos = (s: string) => s.replace(/\D/g, "");
const HORA = /^\d{1,2}[:.]\d{2}/;
const dataBR = (d: string) => d.split("-").reverse().join("/");
const DIAS_SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

export function formatarCpf(cpf: string): string {
  const d = soDigitos(cpf);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf.trim();
}

export function formatarCnpj(doc: string): string {
  const d = soDigitos(doc);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return formatarCpf(d);
  return doc.trim();
}

/** Primeiro campo não vazio dentre os nomes possíveis (a API mistura nomes; nenhum é inventado: só se mostra o que vier). */
const primeiro = (obj: unknown, nomes: string[]) => {
  for (const n of nomes) {
    const v = texto(valorDoCampo(obj, n));
    if (v) return v;
  }
  return "";
};

/** Grade "Horário de trabalho" (SEG a DOM). Horário cíclico (rodízio) não tem grade semanal fixa: devolve null. */
export function horarioDeTrabalho(horario: unknown): HorarioDoDia[] | null {
  if (!horario) return null;
  const ciclos = valorDoCampo(horario, "Ciclos");
  if (Array.isArray(ciclos) && ciclos.length > 0) return null;
  const dias = valorDoCampo(horario, "Dias");
  if (!Array.isArray(dias)) return null;
  const grade: HorarioDoDia[] = DIAS_SEMANA.map((dia) => ({ dia, horas: ["", "", "", "", "", ""] }));
  let algum = false;
  for (const d of dias) {
    const n = Number(valorDoCampo(d, "DiaSemana"));
    if (!Number.isInteger(n) || n < 0 || n > 6) continue;
    const alvo = grade[n]; // 0 = segunda, como no resto do app
    const folga = Number(valorDoCampo(d, "TipoDia")) === 2;
    for (let i = 0; i < 3; i++) {
      const e = texto(valorDoCampo(d, `Entrada${i + 1}`));
      const s = texto(valorDoCampo(d, `Saida${i + 1}`));
      alvo.horas[i * 2] = !folga && HORA.test(e) ? e.slice(0, 5) : "";
      alvo.horas[i * 2 + 1] = !folga && HORA.test(s) ? s.slice(0, 5) : "";
    }
    algum = true;
  }
  return algum ? grade : null;
}

type Bruto = { funcionario: unknown; empresa: unknown; horario: unknown };

export function montarCabecalho({ funcionario, empresa, horario }: Bruto): CabecalhoCartao {
  const admissao = texto(valorDoCampo(funcionario, "Admissao")).slice(0, 10);
  return {
    empresaNome: primeiro(empresa, ["Nome"]),
    cnpj: formatarCnpj(primeiro(empresa, ["Documento"])),
    inscricao: primeiro(empresa, ["Inscricao"]),
    departamento: primeiro(valorDoCampo(funcionario, "Departamento"), ["Descricao", "Nome"]),
    funcao: primeiro(valorDoCampo(funcionario, "Funcao"), ["Descricao", "Nome"]),
    nome: primeiro(funcionario, ["Nome"]),
    admissao: /^\d{4}-\d{2}-\d{2}$/.test(admissao) ? admissao : null,
    cpf: formatarCpf(primeiro(funcionario, ["Cpf"])),
    ctps: primeiro(funcionario, ["Ctps", "NumeroCtps", "CarteiraTrabalho"]),
    numeroFolha: primeiro(funcionario, ["NumeroFolha"]),
    responsavelCargo: primeiro(empresa, ["ResponsavelCargo"]),
    horarioTrabalho: horarioDeTrabalho(horario),
  };
}

const COLUNAS_BATIDA = ["Entrada 1", "Saída 1", "Entrada 2", "Saída 2"] as const;
/** Valor do cálculo oficial que conta como "alguma coisa" (não vazio, nem 0 nem 00:00). */
const preenchido = (v: string | undefined) => !!v && /[1-9]/.test(v);
const ver = (v: string | undefined) => (preenchido(v) ? v!.trim() : "");

/** Uma célula de batida: o que o Secullum calculou; "*" quando é batida lançada manualmente. */
function celulaBatida(d: DiaMes, i: number): string {
  const oficial = d.oficial?.[COLUNAS_BATIDA[i]]?.trim();
  const b = d.batidas[i];
  if (!d.oficial) return b ? b.hora.slice(0, 5) + (b.manual ? "*" : "") : "";
  if (!oficial) return "";
  if (!HORA.test(oficial)) return oficial; // texto do Secullum (ex.: FOLGA, justificativa)
  const hora = oficial.slice(0, 5);
  const manual = d.batidas.some((x) => x.manual && x.hora.slice(0, 5) === hora);
  return hora + (manual ? "*" : "");
}

export function linhasDoCartao(m: MesDoColaborador): LinhaCartao[] {
  return m.dias.map((d) => {
    const celulas = [0, 1, 2, 3].map((i) => celulaBatida(d, i)) as LinhaCartao["celulas"];
    // Dia de folga sem texto do Secullum nas batidas: mostra FOLGA, como no cartão original.
    const folga = d.oficial && celulas.every((c) => c === "") && d.oficial["Folga"] && !/^(0+([:.]0+)?)$/.test(d.oficial["Folga"].trim());
    return {
      dia: d.dia,
      rotulo: `${dataBR(d.dia)} - ${d.diaSemana.charAt(0).toUpperCase()}${d.diaSemana.slice(1)}`,
      celulas: folga ? ["FOLGA", "FOLGA", "FOLGA", "FOLGA"] : celulas,
      normais: ver(d.oficial?.["Normais"]),
      faltas: ver(d.oficial?.["Faltas"]),
      extras: ver(d.oficial?.["Extras"]),
      dsr: ver(d.oficial?.["DSR"]),
      carga: ver(d.oficial?.["Carga"]),
      notTot: ver(d.oficial?.["Not.Tot."]),
    };
  });
}

export type TotaisCartao = Pick<LinhaCartao, "normais" | "faltas" | "extras" | "dsr" | "carga" | "notTot">;

export function totaisDoCartao(m: MesDoColaborador): TotaisCartao | null {
  const t = m.oficial?.totais;
  if (!t) return null;
  return { normais: ver(t["Normais"]), faltas: ver(t["Faltas"]), extras: ver(t["Extras"]), dsr: ver(t["DSR"]), carga: ver(t["Carga"]), notTot: ver(t["Not.Tot."]) };
}

export type AlteracaoDia = { dia: string; linhas: string[] };

/** "Justificativas de alteração": batida incluída (I) ou desconsiderada (D) com o motivo, agrupadas por dia. */
export function justificativasDeAlteracao(m: MesDoColaborador): AlteracaoDia[] {
  const porDia = new Map<string, string[]>();
  for (const a of [...m.alteracoes].sort((x, y) => x.dia.localeCompare(y.dia) || x.hora.localeCompare(y.hora))) {
    const linhas = porDia.get(a.dia) ?? [];
    linhas.push(`${a.hora.slice(0, 5)} - ${a.tipo}${a.motivo ? ` - ${a.motivo}` : ""}`);
    porDia.set(a.dia, linhas);
  }
  return [...porDia.entries()].map(([dia, linhas]) => ({ dia, linhas }));
}
