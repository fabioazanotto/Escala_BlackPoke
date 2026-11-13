import { describe, expect, it } from "vitest";
import type { Avaliacao } from "./aoVivo";
import type { PainelAoVivo, PessoaAoVivo } from "./aoVivoTipos";
import { indicePorFuncionario, montarGrupos, resumoDoGrupo, situacaoDaLista } from "./lista";

const av = (situacao: string, extra: Partial<Avaliacao> = {}): Avaliacao => ({ situacao, atrasoMin: null, minutosSemRegistro: null, minutosNoIntervalo: null, alertaIntervalo: false, intervaloCurtoMin: null, semRetorno: false, semSaida: false, motivo: null, ...extra }) as Avaliacao;
const pessoa = (id: number, a: Avaliacao, extra: Partial<PessoaAoVivo> = {}): PessoaAoVivo => ({ chave: `f${id}`, funcionarioId: id, nome: `P${id}`, loja: "santos", previsto: "16:00–00:20", fontePrevisto: "escala", batidas: [], batidasExtras: 0, avaliacao: a, rotulo: "", escalaSituacao: null, foraDaEscala: false, semVinculo: false, unidade: null, ...extra });
const painel = (escala: PessoaAoVivo[], ponto: PessoaAoVivo[] = []) =>
  ({ lojas: [{ chave: "santos", nome: "BlackPoke Santos", escala: { pessoas: escala, contagem: {}, foraDaEscala: [] }, ponto: { pessoas: ponto, contagem: {} } }] }) as unknown as PainelAoVivo;

describe("situacaoDaLista", () => {
  const s = (a: Avaliacao, extra: Partial<PessoaAoVivo> = {}) => situacaoDaLista({ escala: pessoa(1, a, extra) }, true);
  it("trabalhando, com aviso de atraso na chegada", () => {
    expect(s(av("trabalhando"), { batidas: [{ hora: "16:02", manual: false }] })).toMatchObject({ status: "trabalhando", rotulo: "Trabalhando", ultimaBatida: "Entrada 16:02", previsto: "16:00–00:20" });
    expect(s(av("trabalhando", { atrasoMin: 12 })).detalhe).toBe("Chegou 12 min depois do previsto");
  });
  it("intervalo, com alerta quando passa do limite", () => {
    expect(s(av("intervalo", { minutosNoIntervalo: 75, alertaIntervalo: true }))).toMatchObject({ status: "intervalo", alerta: true, detalhe: "Há 1h15 ⚠ passou do limite" });
  });
  it("atrasado sem registro, ausente e faltou", () => {
    expect(s(av("atrasado_sem_registro", { minutosSemRegistro: 8 }))).toMatchObject({ status: "atrasado", rotulo: "Atrasado", detalhe: "Sem registro há 8 min" });
    expect(s(av("ausente", { minutosSemRegistro: 30 }))).toMatchObject({ status: "ausente", rotulo: "Ausente" });
    expect(s(av("falta"))).toMatchObject({ status: "ausente", rotulo: "Faltou" });
  });
  it("fora do horário: encerrou, folga, ainda não começou, sem batida", () => {
    expect(s(av("encerrou"))).toMatchObject({ status: "fora", rotulo: "Fora do horário", detalhe: "Turno encerrado" });
    expect(s(av("folga")).detalhe).toBe("Folga");
    expect(s(av("aguardando")).detalhe).toBe("Ainda não começou");
    expect(s(av("sem_batida")).detalhe).toBe("Sem batida hoje");
  });
  it("trabalhando fora da escala avisa", () => {
    expect(s(av("trabalhando"), { foraDaEscala: true }).detalhe).toBe("Fora da escala hoje");
  });
  it("justificado mostra o motivo", () => {
    expect(s(av("justificado", { motivo: "Atestado" }))).toMatchObject({ status: "justificado", rotulo: "Justificado: Atestado" });
  });
  it("prefere a escala; sem escala usa o ponto; sem nada diz sem informação; desligado é desligado", () => {
    expect(situacaoDaLista({ escala: pessoa(1, av("encerrou")), ponto: pessoa(1, av("trabalhando")) }, true).status).toBe("fora");
    expect(situacaoDaLista({ ponto: pessoa(1, av("trabalhando")) }, true).status).toBe("trabalhando");
    expect(situacaoDaLista(undefined, true).status).toBe("sem_info");
    expect(situacaoDaLista({ ponto: pessoa(1, av("trabalhando")) }, false).status).toBe("desligado");
  });
  it("avisa possível batida duplicada", () => {
    expect(s(av("trabalhando"), { duplicadas: ["08:51"] }).detalhe).toBe("Possível batida duplicada (08:51)");
  });
  it("encerrou com retorno do intervalo sem registro avisa", () => {
    expect(s(av("encerrou", { retornoEmAberto: true })).detalhe).toBe("Turno encerrado · Retorno do intervalo sem registro");
  });
  it("dados desatualizados não viram ausência", () => {
    expect(s(av("sem_registro_desatualizado")).status).toBe("sem_info");
  });
});

describe("montarGrupos", () => {
  const funcs = [
    { id: 2, nome: "Zélia", empresa: "EMP SANTOS", lojaChave: "santos", loja: "BlackPoke Santos", ativo: true },
    { id: 1, nome: "Ana", empresa: "EMP SANTOS", lojaChave: "santos", loja: "BlackPoke Santos", ativo: true },
    { id: 3, nome: "Bruno", empresa: "POMPEIA", lojaChave: "miyagi", loja: "Seu Miyagi Sushi", ativo: true },
    { id: 4, nome: "Carlos", empresa: "EMP SANTOS", lojaChave: "santos", loja: "BlackPoke Santos", ativo: false },
  ];
  const p = painel([pessoa(1, av("trabalhando")), pessoa(2, av("intervalo"))]);
  it("agrupa por empresa, em ordem alfabética, e esconde desligados por padrão", () => {
    const g = montarGrupos(funcs, p, { lojaChave: null, busca: "", desligados: false });
    expect(g.map((x) => x.titulo)).toEqual(["Santos · EMP SANTOS", "Seu Miyagi Sushi · POMPEIA"]);
    expect(g[0].itens.map((i) => i.nome)).toEqual(["Ana", "Zélia"]);
    expect(g[0].itens[0].situacao.status).toBe("trabalhando");
  });
  it("mostra desligados quando pedido, filtra por loja e busca sem acento", () => {
    expect(montarGrupos(funcs, p, { lojaChave: null, busca: "", desligados: true })[0].itens).toHaveLength(3);
    expect(montarGrupos(funcs, p, { lojaChave: "miyagi", busca: "", desligados: false })).toHaveLength(1);
    expect(montarGrupos(funcs, p, { lojaChave: null, busca: "zelia", desligados: false })[0].itens.map((i) => i.nome)).toEqual(["Zélia"]);
  });
});

describe("resumoDoGrupo / indicePorFuncionario", () => {
  it("resume só o que existe, na ordem de atenção", () => {
    const sit = [av("ausente"), av("trabalhando"), av("trabalhando"), av("encerrou")].map((a) => situacaoDaLista({ escala: pessoa(1, a) }, true));
    expect(resumoDoGrupo(sit).map((x) => x.texto)).toEqual(["1 ausente", "2 trabalhando", "1 fora do horário"]);
  });
  it("indexa escala e ponto pelo funcionário", () => {
    const i = indicePorFuncionario(painel([pessoa(1, av("trabalhando"))], [pessoa(1, av("encerrou")), pessoa(2, av("trabalhando"))]));
    expect(i.get(1)?.escala).toBeDefined();
    expect(i.get(1)?.ponto).toBeDefined();
    expect(i.get(2)?.escala).toBeUndefined();
  });
});
