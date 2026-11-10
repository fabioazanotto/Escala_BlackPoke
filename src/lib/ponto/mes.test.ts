import { describe, expect, it } from "vitest";
import { jornadaDe } from "./aoVivo";
import { montarMes, parseCalcular, pontosDeAtencao, temValor, ultimoDiaDoMes, type DiaEscala, type EntradaMes } from "./mes";

const noite = jornadaDe("16:00", "00:20")!;
const reg = (data: string, hora: string, tipo = 0) => ({ data, hora, tipo });

function base(extra: Partial<EntradaMes> = {}): EntradaMes {
  return { mes: "2026-11", hoje: "2026-11-10", agoraMin: 18 * 60, registros: [], agrupadas: new Map(), escala: null, horario: () => ({ jornada: noite, folga: false, texto: "16:00–00:20" }), oficial: null, ...extra };
}
const escalaTodos = (sit: string, jornada = noite): Map<string, DiaEscala> => new Map(Array.from({ length: 30 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, "0")}`, { situacao: sit, jornada }]));
const dia = (r: ReturnType<typeof montarMes>, d: string) => r.dias.find((x) => x.dia === d)!;

describe("mês do colaborador", () => {
  it("lista todos os dias do mês e marca os futuros", () => {
    const r = montarMes(base());
    expect(r.dias).toHaveLength(30);
    expect(ultimoDiaDoMes("2026-02")).toBe("2026-02-28");
    expect(dia(r, "2026-11-11").futuro).toBe(true);
    expect(dia(r, "2026-11-10").futuro).toBe(false);
    expect(dia(r, "2026-11-03").diaSemana).toBe("ter");
  });

  it("com escala: falta quando escalado sem batida num dia passado; folga e justificativa não são falta", () => {
    const escala = escalaTodos("trabalha");
    escala.set("2026-11-04", { situacao: "folga", jornada: noite });
    escala.set("2026-11-05", { situacao: "ferias", jornada: noite });
    const r = montarMes(base({ escala }));
    expect(dia(r, "2026-11-03").avaliacao?.situacao).toBe("falta");
    expect(dia(r, "2026-11-04").avaliacao?.situacao).toBe("folga");
    expect(dia(r, "2026-11-05").avaliacao).toMatchObject({ situacao: "justificado", motivo: "Férias" });
    expect(r.resumo.faltas).toBe(7); // dias 1,2,3,6,7,8,9 (o dia 10 ainda está em andamento)
  });

  it("atraso, intervalo curto, batida faltando e saída antecipada", () => {
    const registros = [
      reg("2026-11-02", "16:12"), reg("2026-11-02", "17:30"), reg("2026-11-02", "18:10"), reg("2026-11-03", "00:20"), // atraso 12, intervalo de 40 min
      reg("2026-11-03", "16:00"), reg("2026-11-03", "17:30"), reg("2026-11-03", "18:30"), // sem saída (3 batidas)
      reg("2026-11-04", "16:00"), reg("2026-11-04", "17:30"), reg("2026-11-04", "18:30"), reg("2026-11-04", "23:50"), // saiu 30 min antes
    ];
    const r = montarMes(base({ escala: escalaTodos("trabalha"), registros }));
    const d2 = dia(r, "2026-11-02");
    expect(d2.avaliacao).toMatchObject({ atrasoMin: 12, intervaloCurtoMin: 40, situacao: "encerrou" });
    expect(d2.trabalhadoMin).toBe(78 + 370);
    expect(dia(r, "2026-11-03").semSaida).toBe(true);
    expect(dia(r, "2026-11-04")).toMatchObject({ saidaAntecipadaMin: 30, semSaida: false });
    expect(r.resumo).toMatchObject({ atrasos: 1, atrasoTotalMin: 12, semSaida: 1, saidasAntecipadas: 1, intervalosCurtos: 1 });
  });

  it("jornada longa só com entrada e saída: sem batida de intervalo", () => {
    const r = montarMes(base({ escala: escalaTodos("trabalha"), registros: [reg("2026-11-02", "16:00"), reg("2026-11-03", "00:20")] }));
    expect(dia(r, "2026-11-02").semIntervalo).toBe(true);
  });

  it("folga trabalhada e justificativa do Secullum", () => {
    const escala = escalaTodos("trabalha");
    escala.set("2026-11-04", { situacao: "folga", jornada: noite });
    const agrupadas = new Map([["2026-11-05", { folga: false, justificativa: "Atestado" }]]);
    const r = montarMes(base({ escala, agrupadas, registros: [reg("2026-11-04", "16:00"), reg("2026-11-04", "20:00")] }));
    expect(dia(r, "2026-11-04").folgaTrabalhada).toBe(true);
    expect(dia(r, "2026-11-05").avaliacao).toMatchObject({ situacao: "justificado", motivo: "Atestado" });
    expect(r.resumo.folgasTrabalhadas).toBe(1);
    expect(r.resumo.justificados).toBe(1);
  });

  it("sem escala no mês: nunca declara falta; sem batida fica neutro e as faltas vêm do cálculo oficial", () => {
    const r = montarMes(base({ mes: "2026-09", hoje: "2026-11-10", registros: [reg("2026-09-02", "16:00"), reg("2026-09-02", "17:30"), reg("2026-09-02", "18:30"), reg("2026-09-03", "00:20")] }));
    expect(r.resumo.faltas).toBeNull();
    expect(r.resumo.diasEscalados).toBeNull();
    expect(dia(r, "2026-09-05").avaliacao?.situacao).toBe("sem_batida");
    expect(dia(r, "2026-09-05").rotulo).toBe("Sem batida");
    expect(dia(r, "2026-09-02")).toMatchObject({ fontePrevisto: "secullum", previsto: "16:00–00:20" });
    expect(dia(r, "2026-09-02").avaliacao?.situacao).toBe("encerrou");
  });

  it("sem escala: o Secullum marcou folga (coluna Folga do cálculo oficial) e o dia aparece como folga", () => {
    const oficial = new Map([["2026-09-04", { Folga: "x", Faltas: "" }]]);
    const r = montarMes(base({ mes: "2026-09", oficial }));
    expect(dia(r, "2026-09-04").avaliacao?.situacao).toBe("folga");
    expect(dia(r, "2026-09-04").rotulo).toBe("Folga (Secullum)");
    expect(dia(r, "2026-09-05").rotulo).toBe("Sem batida");
  });

  it("dia de folga futuro não mostra horário previsto", () => {
    const escala = escalaTodos("trabalha");
    escala.set("2026-11-18", { situacao: "folga", jornada: noite });
    const r = montarMes(base({ escala }));
    expect(dia(r, "2026-11-18").previsto).toBeNull();
    expect(dia(r, "2026-11-19").previsto).toBe("16:00–00:20");
  });

  it("batidas manuais e desconsideradas são contadas; desconsiderada não conta como batida", () => {
    const r = montarMes(base({ registros: [reg("2026-11-02", "16:00", 1), reg("2026-11-02", "20:00", 3), reg("2026-11-02", "17:30")] }));
    const d = dia(r, "2026-11-02");
    expect(d.manuais).toBe(1);
    expect(d.desconsideradas).toBe(1);
    expect(d.batidas.map((b) => b.hora)).toEqual(["16:00", "17:30"]);
    expect(r.resumo).toMatchObject({ manuais: 1, desconsideradas: 1 });
  });

  it("compara com o cálculo oficial e marca divergências", () => {
    const oficial = new Map([
      ["2026-11-03", { Faltas: "00:00", "Atras.": "" }], // nós vemos falta, ele não
      ["2026-11-02", { Faltas: "00:00", "Atras.": "" }], // atraso de 12 min no BlackPoke, o Secullum não lançou
    ]);
    const registros = [reg("2026-11-02", "16:12"), reg("2026-11-02", "17:30"), reg("2026-11-02", "18:30"), reg("2026-11-03", "00:20")];
    const r = montarMes(base({ escala: escalaTodos("trabalha"), registros, oficial }));
    expect(dia(r, "2026-11-03").divergencias.join()).toContain("BlackPoke vê falta");
    expect(dia(r, "2026-11-02").divergencias.join()).toContain("Atraso no BlackPoke");
    expect(r.resumo.divergencias).toBe(2);
  });

  it("madrugada: a saída às 00:20 do dia seguinte pertence ao dia do turno", () => {
    const r = montarMes(base({ escala: escalaTodos("trabalha"), registros: [reg("2026-11-02", "16:00"), reg("2026-11-02", "17:30"), reg("2026-11-02", "18:30"), reg("2026-11-03", "00:20")] }));
    expect(dia(r, "2026-11-02").batidas.map((b) => b.hora)).toEqual(["16:00", "17:30", "18:30", "00:20"]);
    expect(dia(r, "2026-11-03").batidas).toHaveLength(0);
  });
});

describe("cálculo oficial e pontos de atenção", () => {
  it("interpreta Colunas, Linhas e Totais pelo nome da coluna", () => {
    const r = parseCalcular({ Colunas: ["Data", "Normais", "Faltas"], Linhas: [{ Key: "2026-11-09T00:00:00", Value: ["09/11/2026 – Seg", "07:20", "00:00"] }, { Key: "lixo", Value: [] }], Totais: ["", "07:20", "00:00"] });
    expect(r.colunas).toEqual(["Data", "Normais", "Faltas"]);
    expect(r.porDia.get("2026-11-09")).toEqual({ Data: "09/11/2026 – Seg", Normais: "07:20", Faltas: "00:00" });
    expect(r.totais.Normais).toBe("07:20");
    expect(parseCalcular(null).colunas).toEqual([]);
  });
  it("temValor", () => {
    expect(temValor("00:00")).toBe(false);
    expect(temValor("")).toBe(false);
    expect(temValor(undefined)).toBe(false);
    expect(temValor("00:12")).toBe(true);
  });
  it("lista os pontos de atenção com as datas", () => {
    const registros = [reg("2026-11-02", "16:12"), reg("2026-11-02", "17:30"), reg("2026-11-02", "18:30"), reg("2026-11-03", "00:20")];
    const r = montarMes(base({ escala: escalaTodos("trabalha"), registros }));
    const t = pontosDeAtencao(r.dias, r.resumo, true).join("\n");
    expect(t).toContain("Faltas");
    expect(t).toContain("02/11 (12 min)");
  });
});
