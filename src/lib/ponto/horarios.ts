// Resumo dos horários cadastrados no Secullum, para entender como a jornada prevista é montada.
// Não contém dados pessoais: só descrição do horário, dias da semana e quantos funcionários ativos usam cada um.

import { valorDoCampo } from "@/lib/integracoes/secullum";

// Na rota Horarios, DiaSemana vai de segunda (0) a domingo (6) (manual, p.18).
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const TIPO_DIA: Record<number, string> = { 0: "Normal", 1: "Extra", 2: "Folga" };

export type DiaDoHorario = { dia: string; texto: string; tipoDia: string; cargaMinutos: number | null };
export type ResumoHorario = {
  id: number | null;
  numero: number | null;
  descricao: string;
  desativado: boolean;
  tipo: unknown; // valor bruto do campo Tipo (significado não documentado)
  ciclos: number; // quantidade de itens em Ciclos (rodízio)
  temDataBase: boolean;
  usoAtivos: number;
  dias: DiaDoHorario[];
};

const lista = (x: unknown) => (Array.isArray(x) ? x : []);

function pares(dia: unknown): string[] {
  const r: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const e = valorDoCampo(dia, `Entrada${i}`);
    const s = valorDoCampo(dia, `Saida${i}`);
    if (typeof e === "string" && e && typeof s === "string" && s) r.push(`${e}–${s}`);
    else if (typeof e === "string" && e) r.push(`${e}–?`);
  }
  return r;
}

export function resumirHorarios(horarios: unknown[], usoPorHorarioId: Map<number, number>): { usados: ResumoHorario[]; naoUsados: number } {
  const todos: ResumoHorario[] = horarios.map((h) => {
    const id = valorDoCampo(h, "Id");
    const dias = lista(valorDoCampo(h, "Dias"))
      .map((d) => {
        const dow = Number(valorDoCampo(d, "DiaSemana"));
        const tipo = Number(valorDoCampo(d, "TipoDia"));
        const p = pares(d);
        const carga = valorDoCampo(d, "Carga");
        return {
          ordem: Number.isFinite(dow) ? dow : 99,
          dia: DIAS[dow] ?? "?",
          texto: p.length > 0 ? p.join(" · ") : tipo === 2 ? "Folga" : "Sem horário",
          tipoDia: TIPO_DIA[tipo] ?? "?",
          cargaMinutos: typeof carga === "number" ? carga : null,
        };
      })
      .sort((a, b) => a.ordem - b.ordem)
      .map((d) => ({ dia: d.dia, texto: d.texto, tipoDia: d.tipoDia, cargaMinutos: d.cargaMinutos }));
    return {
      id: typeof id === "number" ? id : null,
      numero: typeof valorDoCampo(h, "Numero") === "number" ? (valorDoCampo(h, "Numero") as number) : null,
      descricao: String(valorDoCampo(h, "Descricao") ?? "").trim(),
      desativado: valorDoCampo(h, "Desativar") === true,
      tipo: valorDoCampo(h, "Tipo") ?? null,
      ciclos: lista(valorDoCampo(h, "Ciclos")).length,
      temDataBase: valorDoCampo(h, "DataBase") !== null && valorDoCampo(h, "DataBase") !== undefined,
      usoAtivos: typeof id === "number" ? (usoPorHorarioId.get(id) ?? 0) : 0,
      dias,
    };
  });
  const usados = todos.filter((h) => h.usoAtivos > 0).sort((a, b) => b.usoAtivos - a.usoAtivos);
  return { usados, naoUsados: todos.length - usados.length };
}
