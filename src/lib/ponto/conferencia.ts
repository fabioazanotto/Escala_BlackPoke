// Conferência de funcionários: Secullum x cadastro de colaboradores do BlackPoke. Funções puras, sem rede nem banco.
// Nada aqui grava ou sobrescreve cadastro: só aponta o que existe nos dois lados, o que existe em um só e o que diverge.
// Os nomes e CPFs que saem daqui só podem chegar a telas de quem tem permissão (hoje: admin). CPF sai sempre mascarado.

export type FuncionarioSecullum = {
  id: number;
  nome: string;
  cpf: string;
  empresaId: number;
  empresaNome: string;
  ativo: boolean; // sem data de demissão
  admissao: string | null; // yyyy-mm-dd
  demissao: string | null;
  horarioId: number | null;
  departamento: string;
  funcao: string;
};

export type ColaboradorBlackPoke = {
  id: string;
  nome: string;
  cpf: string | null;
  unidadeId: string;
  unidadeNome: string;
  ativo: boolean;
  admissao: string | null;
  desligamento: string | null;
};

/** Empresa do Secullum incluída no projeto e a unidade do app a que corresponde (pode não existir ainda). */
/** Vínculo confirmado pelo administrador: colaborador do BlackPoke = funcionário do Secullum. */
export type VinculoConfirmado = { colaboradorId: string; funcionarioId: number };

export type EmpresaConfigurada = { empresaId: number; nome: string; unidadeId: string | null; unidadeNome: string | null; lojaChave?: string | null };

export type LadoSecullum = { id: number; nome: string; cpfMascarado: string; empresa: string; unidadeEsperada: string | null; ativo: boolean; admissao: string | null; demissao: string | null; departamento: string; funcao: string };
export type LadoBlackPoke = { id: string; nome: string; cpfMascarado: string | null; unidade: string; ativo: boolean; admissao: string | null; desligamento: string | null };

export type Item = {
  secullum?: LadoSecullum;
  blackpoke?: LadoBlackPoke;
  confianca?: "vinculo" | "cpf" | "nome";
  motivos: string[];
};

export type ResultadoConferencia = {
  resumo: {
    secullumAtivos: number;
    secullumDesligados: number;
    blackpokeAtivos: number;
    blackpokeInativos: number;
    nosDois: number;
    soSecullum: number;
    soBlackpoke: number;
    duvidosos: number;
    duplicidades: number;
    comDivergencia: number;
    blackpokeSemCpf: number;
    recontratados: number; // ativos que também têm um vínculo anterior (desligado) no Secullum
  };
  nosDois: Item[];
  soSecullum: Item[];
  soBlackpoke: Item[];
  duvidosos: Item[];
  duplicidades: Item[];
};

// ---------------------------------------------------------------- normalização

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !PARTICULAS.has(t))
    .join(" ");
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** 12345678901 -> ***.456.789-** (mostra só o miolo, o bastante para distinguir duas pessoas). */
export function mascararCpf(cpf: string | null | undefined): string | null {
  const d = soDigitos(cpf);
  if (d.length !== 11) return null;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Nomes "parecidos": mesmo primeiro nome e cada parte do nome mais curto combina (inteira ou como inicial) com uma parte do mais longo. */
export function nomesParecidos(a: string, b: string): boolean {
  const ta = normalizarNome(a).split(" ").filter(Boolean);
  const tb = normalizarNome(b).split(" ").filter(Boolean);
  if (ta.length < 2 || tb.length < 2 || ta[0] !== tb[0]) return false;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const usados = new Set<number>();
  return curto.slice(1).every((t) => {
    const i = longo.findIndex((l, idx) => idx > 0 && !usados.has(idx) && (l === t || (t.length === 1 && l.startsWith(t))));
    if (i === -1) return false;
    usados.add(i);
    return true;
  });
}

/** Diferença de no máximo uma letra entre duas palavras (erro de digitação: "Lenilto" x "Lenilton", "Rafaela" x "Rafaella"). */
function ateUmaLetraDeDiferenca(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1); // uma letra trocada
  const [curta, longa] = a.length < b.length ? [a, b] : [b, a];
  return curta.slice(i) === longa.slice(i + 1); // uma letra a mais
}

/** Mesmo primeiro nome, ou quase (uma letra de diferença, só em nomes com 5 letras ou mais para não confundir "Ana" e "Ani"). */
function primeiroNomeCompativel(a: string, b: string): boolean {
  return a === b || (a.length >= 5 && b.length >= 5 && ateUmaLetraDeDiferenca(a, b));
}

/**
 * Candidato a ser a mesma pessoa: nomes parecidos OU primeiro nome igual/quase igual quando um dos lados só tem o primeiro
 * nome (é o caso do cadastro do BlackPoke, que usa "Davidson" ou "Matheus P."). Só serve para SUGERIR: nunca liga sozinho.
 */
export function nomesCompativeis(a: string, b: string): boolean {
  const ta = normalizarNome(a).split(" ").filter(Boolean);
  const tb = normalizarNome(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0 || !primeiroNomeCompativel(ta[0], tb[0])) return false;
  if (ta.length === 1 || tb.length === 1) return true;
  return nomesParecidos([tb[0], ...ta.slice(1)].join(" "), tb.join(" "));
}

// ---------------------------------------------------------------- conferência

export function conferirFuncionarios(secullum: FuncionarioSecullum[], blackpoke: ColaboradorBlackPoke[], empresas: EmpresaConfigurada[], vinculos: VinculoConfirmado[] = []): ResultadoConferencia {
  const empresaPorId = new Map(empresas.map((e) => [e.empresaId, e]));
  const unidadeEsperada = (s: FuncionarioSecullum) => empresaPorId.get(s.empresaId)?.unidadeNome ?? null;

  const ladoS = (s: FuncionarioSecullum): LadoSecullum => ({
    id: s.id,
    nome: s.nome,
    cpfMascarado: mascararCpf(s.cpf) ?? "—",
    empresa: s.empresaNome,
    unidadeEsperada: unidadeEsperada(s),
    ativo: s.ativo,
    admissao: s.admissao,
    demissao: s.demissao,
    departamento: s.departamento,
    funcao: s.funcao,
  });
  const ladoB = (b: ColaboradorBlackPoke): LadoBlackPoke => ({ id: b.id, nome: b.nome, cpfMascarado: mascararCpf(b.cpf), unidade: b.unidadeNome, ativo: b.ativo, admissao: b.admissao, desligamento: b.desligamento });

  const resultado: ResultadoConferencia = {
    resumo: {
      secullumAtivos: secullum.filter((s) => s.ativo).length,
      secullumDesligados: secullum.filter((s) => !s.ativo).length,
      blackpokeAtivos: blackpoke.filter((b) => b.ativo).length,
      blackpokeInativos: blackpoke.filter((b) => !b.ativo).length,
      nosDois: 0,
      soSecullum: 0,
      soBlackpoke: 0,
      duvidosos: 0,
      duplicidades: 0,
      comDivergencia: 0,
      blackpokeSemCpf: blackpoke.filter((b) => b.ativo && soDigitos(b.cpf).length !== 11).length,
      recontratados: 0,
    },
    nosDois: [],
    soSecullum: [],
    soBlackpoke: [],
    duvidosos: [],
    duplicidades: [],
  };

  // Duplicidades: duas pessoas ATIVAS no Secullum com o mesmo CPF ou o mesmo nome. Ativo + desligado com o mesmo CPF
  // é recontratação (vínculos diferentes ao longo do tempo), não duplicidade: só entra na contagem.
  const ativos = secullum.filter((s) => s.ativo);
  const grupos = new Map<string, FuncionarioSecullum[]>();
  for (const s of ativos) {
    const chaves = [soDigitos(s.cpf).length === 11 ? `cpf:${soDigitos(s.cpf)}` : "", `nome:${normalizarNome(s.nome)}`].filter(Boolean);
    for (const k of chaves) grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }
  const jaListados = new Set<number>();
  for (const [chave, lista] of grupos) {
    if (lista.length < 2) continue;
    for (const s of lista) {
      if (jaListados.has(s.id)) continue;
      jaListados.add(s.id);
      resultado.duplicidades.push({ secullum: ladoS(s), motivos: [chave.startsWith("cpf:") ? "Mesmo CPF em mais de um cadastro ativo do Secullum" : "Mesmo nome em mais de um cadastro ativo do Secullum"] });
    }
  }
  const cpfsDesligados = new Set(secullum.filter((s) => !s.ativo && soDigitos(s.cpf).length === 11).map((s) => soDigitos(s.cpf)));
  resultado.resumo.recontratados = ativos.filter((s) => cpfsDesligados.has(soDigitos(s.cpf))).length;

  const sLivres = new Set(secullum.map((s) => s.id));
  const bLivres = new Set(blackpoke.map((b) => b.id));
  const sPorId = new Map(secullum.map((s) => [s.id, s]));
  const bPorId = new Map(blackpoke.map((b) => [b.id, b]));

  const divergencias = (s: FuncionarioSecullum, b: ColaboradorBlackPoke): string[] => {
    const m: string[] = [];
    if (s.ativo !== b.ativo) m.push(s.ativo ? "Ativo no Secullum, inativo no BlackPoke" : "Desligado no Secullum, ativo no BlackPoke");
    const esperada = empresaPorId.get(s.empresaId);
    if (esperada?.unidadeId && esperada.unidadeId !== b.unidadeId) m.push(`Empresa do Secullum corresponde à unidade ${esperada.unidadeNome}, mas o BlackPoke tem ${b.unidadeNome}`);
    if (s.admissao && b.admissao && s.admissao !== b.admissao) m.push("Data de admissão diferente");
    if (soDigitos(b.cpf).length !== 11) m.push("Sem CPF no BlackPoke (o Secullum tem)");
    return m;
  };

  const parear = (s: FuncionarioSecullum, b: ColaboradorBlackPoke, confianca: "vinculo" | "cpf" | "nome") => {
    sLivres.delete(s.id);
    bLivres.delete(b.id);
    const motivos = divergencias(s, b);
    if (motivos.length > 0) resultado.resumo.comDivergencia += 1;
    resultado.nosDois.push({ secullum: ladoS(s), blackpoke: ladoB(b), confianca, motivos });
  };

  // 0) Vínculos já confirmados pelo administrador valem mais que qualquer suposição.
  for (const v of vinculos) {
    const s = sPorId.get(v.funcionarioId);
    const b = bPorId.get(v.colaboradorId);
    if (s && b && sLivres.has(s.id) && bLivres.has(b.id)) parear(s, b, "vinculo");
  }

  // Os passos 1 e 2 rodam primeiro só com os ATIVOS do Secullum e depois com os desligados: quem foi recontratado tem
  // um vínculo ativo e um desligado com o mesmo nome, e o ativo é o que vale (o desligado não concorre com ele).
  const bPorCpf = new Map<string, ColaboradorBlackPoke[]>();
  for (const b of blackpoke) if (soDigitos(b.cpf).length === 11) bPorCpf.set(soDigitos(b.cpf), [...(bPorCpf.get(soDigitos(b.cpf)) ?? []), b]);

  const rodada = (ehAtivo: boolean) => {
    const pool = secullum.filter((s) => s.ativo === ehAtivo && sLivres.has(s.id) && !jaListados.has(s.id));

    // 1) Mesmo CPF.
    for (const s of pool) {
      if (!sLivres.has(s.id)) continue;
      const c = (bPorCpf.get(soDigitos(s.cpf)) ?? []).filter((b) => bLivres.has(b.id));
      if (c.length === 1) parear(s, c[0], "cpf");
    }

    // 2) Mesmo nome (normalizado), só quando é inequívoco dos dois lados.
    const sPorNome = new Map<string, FuncionarioSecullum[]>();
    for (const s of pool) if (sLivres.has(s.id)) sPorNome.set(normalizarNome(s.nome), [...(sPorNome.get(normalizarNome(s.nome)) ?? []), s]);
    const bPorNome = new Map<string, ColaboradorBlackPoke[]>();
    for (const id of bLivres) {
      const b = bPorId.get(id)!;
      bPorNome.set(normalizarNome(b.nome), [...(bPorNome.get(normalizarNome(b.nome)) ?? []), b]);
    }
    for (const [nome, ss] of sPorNome) {
      const bs = bPorNome.get(nome) ?? [];
      if (ss.length === 1 && bs.length === 1) {
        const [s, b] = [ss[0], bs[0]];
        const cpfsDiferem = soDigitos(s.cpf).length === 11 && soDigitos(b.cpf).length === 11 && soDigitos(s.cpf) !== soDigitos(b.cpf);
        if (cpfsDiferem) {
          sLivres.delete(s.id);
          bLivres.delete(b.id);
          resultado.duvidosos.push({ secullum: ladoS(s), blackpoke: ladoB(b), motivos: ["Mesmo nome, mas CPFs diferentes"] });
        } else {
          parear(s, b, "nome");
        }
      } else if (bs.length > 0) {
        for (const s of ss) {
          sLivres.delete(s.id);
          resultado.duvidosos.push({ secullum: ladoS(s), motivos: [`Nome igual a ${bs.length} colaborador(es) do BlackPoke e a ${ss.length} cadastro(s) do Secullum: não dá para ligar sozinho`] });
        }
      }
    }
  };
  rodada(true);
  rodada(false);

  // 3) O que sobrou: candidatos (nome parecido ou mesmo primeiro nome) vão para decisão do RH; o resto é "só em um dos lados".
  for (const id of [...sLivres]) {
    const s = sPorId.get(id)!;
    if (jaListados.has(s.id) || !s.ativo) continue; // desligados não entram na procura de candidatos
    const candidatos = [...bLivres].map((x) => bPorId.get(x)!).filter((b) => b.ativo && nomesCompativeis(s.nome, b.nome));
    if (candidatos.length === 0) continue;
    sLivres.delete(id);
    for (const b of candidatos) {
      const esperada = empresaPorId.get(s.empresaId);
      const mesma = esperada?.unidadeId ? (esperada.unidadeId === b.unidadeId ? " Mesma unidade." : ` Unidades diferentes (${esperada.unidadeNome} no Secullum, ${b.unidadeNome} no BlackPoke).`) : "";
      resultado.duvidosos.push({ secullum: ladoS(s), blackpoke: ladoB(b), motivos: [`Mesmo primeiro nome / nome parecido: confirmar se é a mesma pessoa.${mesma}`] });
    }
  }
  const duvidososB = new Set(resultado.duvidosos.map((d) => d.blackpoke?.id).filter(Boolean));

  for (const id of sLivres) {
    const s = sPorId.get(id)!;
    if (!s.ativo) continue; // desligado que não existe no BlackPoke é esperado: só entra na contagem
    const motivos = [unidadeEsperada(s) ? "Ativo no Secullum e sem cadastro correspondente no BlackPoke" : "Empresa do Secullum ainda sem unidade no app"];
    resultado.soSecullum.push({ secullum: ladoS(s), motivos });
  }
  for (const id of bLivres) {
    const b = bPorId.get(id)!;
    if (!b.ativo || duvidososB.has(b.id)) continue;
    resultado.soBlackpoke.push({ blackpoke: ladoB(b), motivos: ["Ativo no BlackPoke e sem cadastro correspondente no Secullum"] });
  }

  const porNome = (a: Item, b: Item) => (a.secullum?.nome ?? a.blackpoke?.nome ?? "").localeCompare(b.secullum?.nome ?? b.blackpoke?.nome ?? "", "pt-BR");
  for (const l of [resultado.nosDois, resultado.soSecullum, resultado.soBlackpoke, resultado.duvidosos, resultado.duplicidades]) l.sort(porNome);
  resultado.resumo.nosDois = resultado.nosDois.length;
  resultado.resumo.soSecullum = resultado.soSecullum.length;
  resultado.resumo.soBlackpoke = resultado.soBlackpoke.length;
  resultado.resumo.duvidosos = resultado.duvidosos.length;
  resultado.resumo.duplicidades = resultado.duplicidades.length;
  return resultado;
}
