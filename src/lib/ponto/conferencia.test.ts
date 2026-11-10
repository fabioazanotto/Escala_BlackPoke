import { describe, expect, it } from "vitest";
import { conferirFuncionarios, mascararCpf, nomesCompativeis, nomesParecidos, normalizarNome, type ColaboradorBlackPoke, type EmpresaConfigurada, type FuncionarioSecullum } from "./conferencia";

const empresas: EmpresaConfigurada[] = [
  { empresaId: 1, nome: "Empresa Santos", unidadeId: "u-santos", unidadeNome: "Santos" },
  { empresaId: 2, nome: "Empresa PG", unidadeId: "u-pg", unidadeNome: "Praia Grande" },
  { empresaId: 3, nome: "Empresa Miyagi", unidadeId: null, unidadeNome: null },
];
let n = 0;
const S = (o: Partial<FuncionarioSecullum> = {}): FuncionarioSecullum => ({ id: ++n, nome: "Pessoa", cpf: "", empresaId: 1, empresaNome: "Empresa Santos", ativo: true, admissao: null, demissao: null, horarioId: 1, departamento: "Cozinha", funcao: "Cozinheiro", ...o });
const B = (o: Partial<ColaboradorBlackPoke> = {}): ColaboradorBlackPoke => ({ id: `b${++n}`, nome: "Pessoa", cpf: null, unidadeId: "u-santos", unidadeNome: "Santos", ativo: true, admissao: null, desligamento: null, ...o });

describe("normalização", () => {
  it("tira acentos, caixa e partículas", () => {
    expect(normalizarNome("  JOSÉ da  Silva-Souza ")).toBe("jose silva souza");
  });
  it("mascara o CPF mostrando só o miolo", () => {
    expect(mascararCpf("123.456.789-01")).toBe("***.456.789-**");
    expect(mascararCpf("123")).toBeNull();
    expect(mascararCpf(null)).toBeNull();
  });
  it("nomes parecidos: inicial e partes", () => {
    expect(nomesParecidos("Matheus P.", "Matheus Pereira da Silva")).toBe(true);
    expect(nomesParecidos("Vitoria B.", "Vitória Batista")).toBe(true);
    expect(nomesParecidos("Matheus P.", "Marcos Pereira")).toBe(false);
    expect(nomesParecidos("Ana", "Ana Paula")).toBe(false); // um nome só não basta
    expect(nomesParecidos("Ana Souza", "Ana Costa")).toBe(false);
  });
});

describe("conferência", () => {
  it("liga por CPF mesmo com nome diferente", () => {
    const r = conferirFuncionarios([S({ nome: "Maria Souza", cpf: "11111111111" })], [B({ nome: "Maria S.", cpf: "111.111.111-11" })], empresas);
    expect(r.nosDois).toHaveLength(1);
    expect(r.nosDois[0].confianca).toBe("cpf");
    expect(r.duvidosos).toHaveLength(0);
  });

  it("liga por nome igual quando é inequívoco e avisa que falta CPF no BlackPoke", () => {
    const r = conferirFuncionarios([S({ nome: "João da Silva", cpf: "22222222222" })], [B({ nome: "JOAO SILVA" })], empresas);
    expect(r.nosDois[0].confianca).toBe("nome");
    expect(r.nosDois[0].motivos).toContain("Sem CPF no BlackPoke (o Secullum tem)");
    expect(r.resumo.comDivergencia).toBe(1);
  });

  it("mesmo nome com CPFs diferentes vai para dúvida, não é ligado", () => {
    const r = conferirFuncionarios([S({ nome: "Ana Lima", cpf: "33333333333" })], [B({ nome: "Ana Lima", cpf: "44444444444" })], empresas);
    expect(r.nosDois).toHaveLength(0);
    expect(r.duvidosos[0].motivos[0]).toContain("CPFs diferentes");
  });

  it("nome abreviado fica como dúvida com os dois lados lado a lado", () => {
    const r = conferirFuncionarios([S({ nome: "Matheus Pereira da Silva", cpf: "55555555555" })], [B({ nome: "Matheus P." })], empresas);
    expect(r.duvidosos).toHaveLength(1);
    expect(r.duvidosos[0].secullum && r.duvidosos[0].blackpoke).toBeTruthy();
    expect(r.soBlackpoke).toHaveLength(0);
    expect(r.soSecullum).toHaveLength(0);
  });

  it("só de um lado: ativos aparecem; desligado que só existe no Secullum só entra na contagem", () => {
    const r = conferirFuncionarios([S({ nome: "Carlos Dias" }), S({ nome: "Pedro Antigo", ativo: false, demissao: "2025-01-01" })], [B({ nome: "Rita Nova" }), B({ nome: "Inativa Antiga", ativo: false })], empresas);
    expect(r.soSecullum.map((i) => i.secullum?.nome)).toEqual(["Carlos Dias"]);
    expect(r.soBlackpoke.map((i) => i.blackpoke?.nome)).toEqual(["Rita Nova"]);
    expect(r.resumo).toMatchObject({ secullumAtivos: 1, secullumDesligados: 1, blackpokeAtivos: 1, blackpokeInativos: 1 });
  });

  it("empresa sem unidade no app é explicada", () => {
    const r = conferirFuncionarios([S({ nome: "Lia Mar", empresaId: 3, empresaNome: "Empresa Miyagi" })], [], empresas);
    expect(r.soSecullum[0].motivos[0]).toContain("sem unidade");
  });

  it("aponta divergências: situação, unidade e admissão", () => {
    const r = conferirFuncionarios(
      [S({ nome: "Bia Rocha", cpf: "66666666666", empresaId: 2, empresaNome: "Empresa PG", ativo: false, demissao: "2026-10-01", admissao: "2024-01-10" })],
      [B({ nome: "Bia Rocha", cpf: "66666666666", unidadeId: "u-santos", unidadeNome: "Santos", ativo: true, admissao: "2024-02-10" })],
      empresas,
    );
    const m = r.nosDois[0].motivos.join(" | ");
    expect(m).toContain("Desligado no Secullum");
    expect(m).toContain("corresponde à unidade Praia Grande");
    expect(m).toContain("admissão diferente");
  });

  it("duplicidades só entre ATIVOS; ativo + desligado com o mesmo CPF é recontratação", () => {
    const r = conferirFuncionarios([S({ nome: "Duda Neves", cpf: "77777777777" }), S({ nome: "Duda Neves", cpf: "77777777777" })], [B({ nome: "Duda Neves" })], empresas);
    expect(r.duplicidades).toHaveLength(2);
    expect(r.nosDois).toHaveLength(0);

    const re = conferirFuncionarios([S({ nome: "Lia Prado", cpf: "88888888888" }), S({ nome: "Lia Prado", cpf: "88888888888", ativo: false, demissao: "2025-03-01" })], [B({ nome: "Lia Prado" })], empresas);
    expect(re.duplicidades).toHaveLength(0);
    expect(re.resumo.recontratados).toBe(1);
    expect(re.nosDois).toHaveLength(1);
    expect(re.nosDois[0].secullum?.ativo).toBe(true);
  });

  it("cadastro só com o primeiro nome vira sugestão (dúvida), nunca é ligado sozinho", () => {
    const r = conferirFuncionarios([S({ nome: "Davidson Alves Pinto", cpf: "99999999999" })], [B({ nome: "Davidson" })], empresas);
    expect(r.nosDois).toHaveLength(0);
    expect(r.duvidosos).toHaveLength(1);
    expect(r.duvidosos[0].motivos[0]).toContain("Mesma unidade");
    expect(r.soBlackpoke).toHaveLength(0);
    expect(r.soSecullum).toHaveLength(0);
  });

  it("dois candidatos com o mesmo primeiro nome aparecem os dois", () => {
    const r = conferirFuncionarios([S({ nome: "Ana Souza" }), S({ nome: "Ana Costa" })], [B({ nome: "Ana" })], empresas);
    expect(r.duvidosos).toHaveLength(2);
  });

  it("nomes compatíveis", () => {
    expect(nomesCompativeis("Davidson", "Davidson Alves")).toBe(true);
    expect(nomesCompativeis("Rafaella", "Rafael Souza")).toBe(false);
    expect(nomesCompativeis("Ana Souza", "Ana Costa")).toBe(false);
  });

  it("erro de digitação de uma letra no primeiro nome ainda gera sugestão", () => {
    expect(nomesCompativeis("Lenilto", "Lenilton Gomes")).toBe(true);
    expect(nomesCompativeis("Rafaela", "Rafaella Dias")).toBe(true);
    expect(nomesCompativeis("Matheus P.", "Matheos Pereira")).toBe(true);
    expect(nomesCompativeis("Ana", "Ani Souza")).toBe(false); // nomes curtos não toleram diferença
    expect(nomesCompativeis("Marcos", "Marcio Souza")).toBe(false); // duas letras de diferença
  });

  it("Lenilto no BlackPoke e Lenilton no Secullum aparecem como sugestão", () => {
    const r = conferirFuncionarios([S({ nome: "Lenilton Gomes de Sá", cpf: "12312312312" })], [B({ nome: "Lenilto" })], empresas);
    expect(r.duvidosos).toHaveLength(1);
    expect(r.soBlackpoke).toHaveLength(0);
    expect(r.soSecullum).toHaveLength(0);
  });

  it("não vaza o CPF inteiro", () => {
    const r = conferirFuncionarios([S({ nome: "Zé Dias", cpf: "12345678901" })], [], empresas);
    expect(JSON.stringify(r)).not.toContain("12345678901");
    expect(r.soSecullum[0].secullum?.cpfMascarado).toBe("***.456.789-**");
  });
});
