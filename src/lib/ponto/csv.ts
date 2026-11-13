// Exportação do mês em CSV (para conferência pelo contador). Separador ";" e BOM para abrir certo no Excel em português.

import { posicionar } from "./aoVivo";
import { duracao, type DiaMes } from "./mes";
import type { MesDoColaborador } from "./mesTipos";

export const COLUNAS_OFICIAIS = ["Normais", "Faltas", "Extras", "Atras.", "Adian.", "Not.", "Carga", "Folga", "JustPa."];

const campo = (v: string | number | null | undefined) => {
  const t = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const dataBR = (d: string) => d.split("-").reverse().join("/");

export function observacoesDoDia(d: DiaMes): string[] {
  const o: string[] = [];
  const a = d.avaliacao;
  if (!a) return o;
  if (a.atrasoMin !== null) o.push(`Chegou ${a.atrasoMin} min depois do previsto`);
  if (d.semSaida) o.push("Batida faltando (número ímpar de batidas)");
  if (d.retornoEmAberto) o.push("Retorno do intervalo sem registro (a última batida foi tratada como saída)");
  if (d.turnoDeduzido) o.push(`Horário do turno da ${d.turnoDeduzido === "noite" ? "noite" : "manhã"} usado (deduzido pelas batidas)`);
  if (d.semIntervalo) o.push("Sem batida de intervalo");
  if (a.intervaloCurtoMin !== null) o.push(`Intervalo de ${a.intervaloCurtoMin} min (menos de 1h)`);
  if (a.semRetorno) o.push("Saiu e não voltou");
  if (d.saidaAntecipadaMin !== null) o.push(`Saiu ${d.saidaAntecipadaMin} min antes do previsto`);
  if (d.folgaTrabalhada) o.push("Trabalhou em dia de folga");
  if (d.manuais > 0) o.push(`${d.manuais} batida(s) manual(is)`);
  if (d.desconsideradas > 0) o.push(`${d.desconsideradas} batida(s) desconsiderada(s)`);
  for (const x of d.divergencias) o.push(`Divergência: ${x}`);
  return o;
}

export function montarCsv(m: MesDoColaborador, incluirOficial: boolean): string {
  const oficiais = incluirOficial && m.oficial ? COLUNAS_OFICIAIS.filter((c) => m.oficial!.colunas.includes(c)) : [];
  const cab = ["Data", "Dia", "Escala", "Previsto", "Entrada", "Saída intervalo", "Retorno", "Saída", "Batidas a mais", "Trabalhado", "Situação", "Observações", ...oficiais.map((c) => `Secullum ${c}`)];
  const linhas = m.dias.map((d) =>
    [
      dataBR(d.dia), d.diaSemana, d.escala ?? "", d.previsto ?? "",
      ...posicionar(d.batidas, d.retornoEmAberto).map((b) => b?.hora ?? ""),
      Math.max(0, d.batidas.length - 4) || "",
      d.trabalhadoMin > 0 ? duracao(d.trabalhadoMin) : "", d.rotulo, observacoesDoDia(d).join(" | "),
      ...oficiais.map((c) => d.oficial?.[c] ?? ""),
    ].map(campo).join(";"),
  );
  const totais = oficiais.length > 0 ? [["TOTAIS (Secullum)", ...Array(11).fill(""), ...oficiais.map((c) => m.oficial!.totais[c] ?? "")].map(campo).join(";")] : [];
  const topo = [`Colaborador;${campo(m.funcionario.nome)}`, `Empresa;${campo(m.funcionario.empresa)}`, `Mês;${m.mes.split("-").reverse().join("/")}`, `CPF;${campo(m.funcionario.cpfMascarado)}`, ""];
  return "﻿" + [...topo, cab.map(campo).join(";"), ...linhas, ...totais].join("\r\n");
}
