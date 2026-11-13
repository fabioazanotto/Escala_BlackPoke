import { describe, expect, it } from "vitest";
import { agoraNoBrasil, batidasDoDia, classificar, contar, deMinutos, diaDeTrabalho, ignorarDuplicadas, inferirTurno, jornadaDe, paraMinutos, posicionar, retornoEmAbertoDe, type Batida } from "./aoVivo";

const m = (h: string) => paraMinutos(h)!;
const bat = (...horas: string[]): Batida[] => horas.map((h) => ({ minuto: m(h) < 300 ? m(h) + 1440 : m(h), hora: h, manual: false }));
const dia = jornadaDe("09:00", "17:20")!; // 540 a 1040
const noite = jornadaDe("16:00", "00:20")!; // 960 a 1460

describe("tempo", () => {
  it("jornada que vira a meia-noite soma 1440 ao fim", () => {
    expect(noite).toEqual({ inicio: 960, fim: 1460 });
    expect(dia).toEqual({ inicio: 540, fim: 1040 });
    expect(deMinutos(1460)).toBe("00:20");
    expect(paraMinutos("9:05")).toBe(545);
    expect(paraMinutos("xx")).toBeNull();
    expect(paraMinutos("25:00")).toBeNull();
  });
  it("antes das 05:00 ainda é o dia de trabalho anterior", () => {
    expect(diaDeTrabalho({ data: "2026-11-11", minutos: 30 })).toEqual({ dia: "2026-11-10", agoraMin: 1470 });
    expect(diaDeTrabalho({ data: "2026-11-11", minutos: 5 * 60 })).toEqual({ dia: "2026-11-11", agoraMin: 300 });
  });
  it("agora no Brasil é UTC-3", () => {
    expect(agoraNoBrasil(new Date("2026-11-10T21:30:00Z"))).toEqual({ data: "2026-11-10", minutos: 18 * 60 + 30 });
    expect(agoraNoBrasil(new Date("2026-11-11T02:10:00Z"))).toEqual({ data: "2026-11-10", minutos: 23 * 60 + 10 });
  });
});

describe("batidas do dia de trabalho", () => {
  const regs = [
    { data: "2026-11-10", hora: "16:04", tipo: 0 },
    { data: "2026-11-10", hora: "17:35", tipo: 0 },
    { data: "2026-11-10", hora: "18:31", tipo: 1 },
    { data: "2026-11-11", hora: "00:20", tipo: 0 }, // saída da noite, pertence ao dia 10
    { data: "2026-11-10", hora: "00:18", tipo: 0 }, // saída da noite do dia 9, NÃO é do dia 10
    { data: "2026-11-10", hora: "20:00", tipo: 3 }, // desconsiderada
    { data: "2026-11-11", hora: "09:00", tipo: 0 }, // entrada do dia seguinte
  ];
  it("pega as batidas do próprio dia e as da madrugada seguinte, em ordem, sem as desconsideradas", () => {
    const r = batidasDoDia(regs, "2026-11-10");
    expect(r.map((x) => x.hora)).toEqual(["16:04", "17:35", "18:31", "00:20"]);
    expect(r[3].minuto).toBe(1460 - 0);
    expect(r[2].manual).toBe(true);
  });
});

describe("sem nenhuma batida", () => {
  const ent = (agoraMin: number, extra = {}) => ({ jornada: noite, batidas: [], agoraMin, ...extra });
  it("antes do horário: aguardando; dentro da tolerância: aguardando", () => {
    expect(classificar(ent(m("15:00"))).situacao).toBe("aguardando");
    expect(classificar(ent(m("16:05"))).situacao).toBe("aguardando");
  });
  it("passou da tolerância: atrasado sem registro, com os minutos", () => {
    const r = classificar(ent(m("16:06")));
    expect(r).toMatchObject({ situacao: "atrasado_sem_registro", minutosSemRegistro: 6 });
    expect(classificar(ent(m("16:20"))).situacao).toBe("atrasado_sem_registro");
  });
  it("depois de 20 minutos: ausente; no fim do turno: falta", () => {
    expect(classificar(ent(m("16:21")))).toMatchObject({ situacao: "ausente", minutosSemRegistro: 21 });
    expect(classificar(ent(1460))).toMatchObject({ situacao: "falta" });
    expect(classificar(ent(1470)).situacao).toBe("falta");
  });
  it("justificativa e folga vencem a ausência", () => {
    expect(classificar(ent(m("17:00"), { justificativa: "Férias" }))).toMatchObject({ situacao: "justificado", motivo: "Férias" });
    expect(classificar(ent(m("17:00"), { folga: true })).situacao).toBe("folga");
  });
  it("dados não confiáveis NUNCA viram ausência nem falta", () => {
    expect(classificar(ent(m("17:00"), { confiavel: false })).situacao).toBe("sem_registro_desatualizado");
    expect(classificar(ent(1470, { confiavel: false })).situacao).toBe("sem_registro_desatualizado");
    // mas antes do horário continua aguardando
    expect(classificar(ent(m("15:00"), { confiavel: false })).situacao).toBe("aguardando");
  });
  it("sem jornada prevista e sem batida: sem_batida", () => {
    expect(classificar({ jornada: null, batidas: [], agoraMin: 600 }).situacao).toBe("sem_batida");
  });
});

describe("com batidas", () => {
  it("1 batida: trabalhando; atraso só conta acima da tolerância", () => {
    expect(classificar({ jornada: noite, batidas: bat("16:04"), agoraMin: m("17:00") })).toMatchObject({ situacao: "trabalhando", atrasoMin: null });
    expect(classificar({ jornada: noite, batidas: bat("16:05"), agoraMin: m("17:00") }).atrasoMin).toBeNull();
    expect(classificar({ jornada: noite, batidas: bat("16:06"), agoraMin: m("17:00") }).atrasoMin).toBe(6);
    expect(classificar({ jornada: noite, batidas: bat("16:35"), agoraMin: m("17:00") })).toMatchObject({ situacao: "trabalhando", atrasoMin: 35 }); // chegou, mesmo muito atrasado
  });

  it("2 batidas no meio do turno: em intervalo, com minutos e alerta acima de 1 hora", () => {
    const r = classificar({ jornada: noite, batidas: bat("16:00", "17:30"), agoraMin: m("18:10") });
    expect(r).toMatchObject({ situacao: "intervalo", minutosNoIntervalo: 40, alertaIntervalo: false });
    const longo = classificar({ jornada: noite, batidas: bat("16:00", "17:30"), agoraMin: m("18:45") });
    expect(longo).toMatchObject({ situacao: "intervalo", minutosNoIntervalo: 75, alertaIntervalo: true });
  });

  it("3 batidas: voltou, trabalhando; intervalo curto aparece como informação", () => {
    const r = classificar({ jornada: noite, batidas: bat("16:00", "17:30", "18:10"), agoraMin: m("20:00") });
    expect(r).toMatchObject({ situacao: "trabalhando", intervaloCurtoMin: 40 });
    expect(classificar({ jornada: noite, batidas: bat("16:00", "17:30", "18:35"), agoraMin: m("20:00") }).intervaloCurtoMin).toBeNull();
  });

  it("4 batidas ou saída perto do fim: encerrou; turno da noite com saída após meia-noite", () => {
    expect(classificar({ jornada: noite, batidas: bat("16:00", "17:30", "18:30", "00:20"), agoraMin: 1465 }).situacao).toBe("encerrou");
    expect(classificar({ jornada: dia, batidas: bat("09:00", "12:00", "13:00", "17:25"), agoraMin: m("17:30") }).situacao).toBe("encerrou");
  });

  it("saiu no meio e o turno acabou sem voltar: encerrou com aviso de falta de retorno", () => {
    const r = classificar({ jornada: dia, batidas: bat("09:00", "12:00"), agoraMin: m("18:00") });
    expect(r).toMatchObject({ situacao: "encerrou", semRetorno: true });
  });

  it("entrou e passou muito do fim sem saída: trabalhando com aviso", () => {
    expect(classificar({ jornada: dia, batidas: bat("09:00", "12:00", "13:00"), agoraMin: m("18:00") })).toMatchObject({ situacao: "trabalhando", semSaida: true });
    expect(classificar({ jornada: dia, batidas: bat("09:00", "12:00", "13:00"), agoraMin: m("17:40") }).semSaida).toBe(false);
  });

  it("sem jornada (fora da escala): só pelas batidas", () => {
    expect(classificar({ jornada: null, batidas: bat("10:00"), agoraMin: 700 }).situacao).toBe("trabalhando");
    expect(classificar({ jornada: null, batidas: bat("10:00", "11:00"), agoraMin: 700 }).situacao).toBe("intervalo");
    expect(classificar({ jornada: null, batidas: bat("10:00", "11:00"), agoraMin: 1000 }).situacao).toBe("encerrou");
  });
});

describe("contagem por loja", () => {
  it("conta cada situação; atrasado inclui quem chegou depois da tolerância e quem ainda não chegou", () => {
    const a = [
      classificar({ jornada: dia, batidas: bat("09:00"), agoraMin: 600 }),
      classificar({ jornada: dia, batidas: bat("09:30"), agoraMin: 600 }),
      classificar({ jornada: dia, batidas: bat("09:00", "12:00"), agoraMin: 12 * 60 + 10 }),
      classificar({ jornada: dia, batidas: [], agoraMin: 9 * 60 + 10 }),
      classificar({ jornada: dia, batidas: [], agoraMin: 10 * 60 }),
      classificar({ jornada: dia, batidas: [], agoraMin: 600, folga: true }),
    ];
    expect(contar(a)).toMatchObject({ trabalhando: 2, intervalo: 1, atrasados: 2, ausentes: 1, aguardando: 0, folgaOuJustificado: 1, total: 6 });
  });
});

describe("retorno do intervalo e posição das batidas", () => {
  it("terceira batida horas depois da saída para o intervalo: encerrou, com retorno em aberto", () => {
    const a = classificar({ jornada: dia, batidas: bat("09:58", "17:11", "19:08"), agoraMin: m("20:00") });
    expect(a).toMatchObject({ situacao: "encerrou", retornoEmAberto: true });
  });
  it("até 70 minutos conta como retorno; posicionar deixa o retorno vazio só quando está em aberto", () => {
    const b = bat("09:00", "12:00", "13:10");
    expect(retornoEmAbertoDe(b)).toBe(false);
    expect(posicionar(b, false).map((x) => x?.hora ?? null)).toEqual(["09:00", "12:00", "13:10", null]);
    const c = bat("09:00", "12:00", "13:30");
    expect(retornoEmAbertoDe(c)).toBe(true);
    expect(posicionar(c, true).map((x) => x?.hora ?? null)).toEqual(["09:00", "12:00", null, "13:30"]);
  });
});

describe("inferirTurno", () => {
  const manha = dia;
  it("primeira batida na janela do outro turno e fora da do próprio", () => {
    expect(inferirTurno(bat("15:43"), manha, noite)).toBe(true);
    expect(inferirTurno(bat("08:30"), noite, manha)).toBe(true);
  });
  it("não troca quando está na janela do próprio turno, fora das duas janelas, ou sem outro turno/batida", () => {
    expect(inferirTurno(bat("09:58"), manha, noite)).toBe(false);
    expect(inferirTurno(bat("12:30"), manha, noite)).toBe(false);
    expect(inferirTurno(bat("15:43"), manha, null)).toBe(false);
    expect(inferirTurno([], manha, noite)).toBe(false);
  });
});

describe("ignorarDuplicadas", () => {
  const horas = (b: Batida[]) => b.map((x) => x.hora);
  it("entrada duplicada: a 2ª batida a poucos minutos da 1ª é ignorada", () => {
    const r = ignorarDuplicadas(bat("08:45", "08:51", "15:07", "16:05"));
    expect(horas(r.usadas)).toEqual(["08:45", "15:07", "16:05"]);
    expect(r.duplicadas).toHaveLength(1);
    expect(r.duplicadas[0]).toMatchObject({ fim: false });
    expect(r.duplicadas[0].batida.hora).toBe("08:51");
  });
  it("saída duplicada no fim do dia", () => {
    const r = ignorarDuplicadas(bat("16:00", "17:30", "18:30", "00:20", "00:21"));
    expect(horas(r.usadas)).toEqual(["16:00", "17:30", "18:30", "00:20"]);
    expect(r.duplicadas[0]).toMatchObject({ fim: true });
  });
  it("o caso do mês: 6 batidas, duplicada de entrada e de saída", () => {
    expect(horas(ignorarDuplicadas(bat("08:45", "08:51", "15:07", "16:05", "17:20", "17:21")).usadas)).toEqual(["08:45", "15:07", "16:05", "17:20"]);
  });
  it("não mexe no intervalo curto (saída e retorno próximos) nem em batidas com mais de 10 minutos", () => {
    expect(ignorarDuplicadas(bat("09:00", "12:00", "12:05")).duplicadas).toEqual([]);
    expect(ignorarDuplicadas(bat("09:00", "09:11", "12:00")).duplicadas).toEqual([]);
    expect(ignorarDuplicadas(bat("09:00", "09:10", "12:00")).duplicadas).toHaveLength(1);
  });
  it("duas batidas a poucos minutos viram só a entrada (a pessoa está trabalhando, não em intervalo)", () => {
    expect(horas(ignorarDuplicadas(bat("16:00", "16:08")).usadas)).toEqual(["16:00"]);
  });
});
