"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { ehRH } from "@/lib/acesso";
import { rotuloFuncao, ROTULO_TURNO } from "@/lib/funcoes";
import {
  funcaoDoCargo,
  lerLinhas,
  limparTexto,
  semAcento,
  type FuncaoProposta,
  type LinhaPlanilha,
} from "@/lib/importacao/colaboradores";
import type { Unidade } from "@/lib/tipos";

type Aba = { nome: string; unidadeId: string; linhas: LinhaPlanilha[]; erro: string | null };

function chaveFuncao(f: FuncaoProposta) {
  return `${semAcento(f.nome)}|${semAcento(f.operacao ?? "")}`;
}

function adivinharUnidade(aba: string, unidades: Unidade[]): string {
  const n = semAcento(aba);
  const alvo = /\bsts\b|santos/.test(n) ? "santos" : /\bpg\b|praia/.test(n) ? "praia grande" : "";
  return unidades.find((u) => semAcento(u.nome) === alvo)?.id ?? "";
}

export default function Importar() {
  const { perfil } = useSessao();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [existentes, setExistentes] = useState<Set<string>>(new Set()); // unidade|nome
  const [abas, setAbas] = useState<Aba[]>([]);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  if (!ehRH(perfil)) {
    return <p className="cartao">Só o RH pode importar colaboradores.</p>;
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setLendo(true);
    setErro(null);
    setResultado(null);
    try {
      const db = supabase();
      const [u, c] = await Promise.all([
        db.from("unidades").select("id, nome, ativa").eq("ativa", true).order("nome"),
        db.from("colaboradores").select("unidade_id, nome"),
      ]);
      if (u.error || c.error) throw new Error((u.error ?? c.error)!.message);
      const listaUnidades = u.data as Unidade[];
      setUnidades(listaUnidades);
      setExistentes(new Set((c.data ?? []).map((x) => `${x.unidade_id}|${semAcento(x.nome)}`)));

      const { default: lerExcel } = await import("read-excel-file/browser");
      const folhas = await lerExcel(arquivo);
      setAbas(
        folhas.map((f) => {
          const { linhas, erro: erroAba } = lerLinhas(f.data as unknown[][]);
          return { nome: f.sheet, unidadeId: adivinharUnidade(f.sheet, listaUnidades), linhas, erro: erroAba };
        }),
      );
    } catch (ex) {
      setAbas([]);
      setErro(`Não consegui ler o arquivo. Use uma planilha .xlsx. (${ex instanceof Error ? ex.message : ex})`);
    }
    setLendo(false);
  }

  function situacao(aba: Aba, l: LinhaPlanilha): "novo" | "existe" | "cargo" | "turno" {
    if (!funcaoDoCargo(l.cargo, l.operacao)) return "cargo";
    if (!l.turno) return "turno";
    if (existentes.has(`${aba.unidadeId}|${semAcento(l.nome)}`)) return "existe";
    return "novo";
  }

  const aImportar = abas.flatMap((a) =>
    a.unidadeId ? a.linhas.filter((l) => situacao(a, l) === "novo").map((l) => ({ aba: a, l })) : [],
  );

  async function importar() {
    setImportando(true);
    setErro(null);
    try {
      const db = supabase();
      let funcoesCriadas = 0;
      const porUnidade = new Map<string, LinhaPlanilha[]>();
      for (const { aba, l } of aImportar) porUnidade.set(aba.unidadeId, [...(porUnidade.get(aba.unidadeId) ?? []), l]);

      for (const [unidadeId, linhas] of porUnidade) {
        const atuais = await db.from("funcoes").select("id, nome, operacao").eq("unidade_id", unidadeId);
        if (atuais.error) throw atuais.error;
        const mapa = new Map<string, string>(atuais.data.map((f) => [chaveFuncao(f), f.id]));

        const novas = new Map<string, FuncaoProposta>();
        for (const l of linhas) {
          const f = funcaoDoCargo(l.cargo, l.operacao)!;
          if (!mapa.has(chaveFuncao(f))) novas.set(chaveFuncao(f), f);
        }
        if (novas.size > 0) {
          const ins = await db
            .from("funcoes")
            .insert([...novas.values()].map((f) => ({ unidade_id: unidadeId, nome: f.nome, operacao: f.operacao })))
            .select("id, nome, operacao");
          if (ins.error) throw ins.error;
          for (const f of ins.data) mapa.set(chaveFuncao(f), f.id);
          funcoesCriadas += ins.data.length;
        }

        const ins = await db.from("colaboradores").insert(
          linhas.map((l) => ({
            unidade_id: unidadeId,
            nome: limparTexto(l.nome),
            cargo: limparTexto(l.cargo) || null,
            funcao_principal_id: mapa.get(chaveFuncao(funcaoDoCargo(l.cargo, l.operacao)!))!,
            turno: l.turno!,
          })),
        );
        if (ins.error) throw ins.error;
      }
      setResultado(`Importação concluída: ${aImportar.length} colaboradores e ${funcoesCriadas} funções novas.`);
      setAbas([]);
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : (ex as { message?: string }).message ?? String(ex);
      setErro(`A importação parou: ${msg}. Confira se o SQL 03_cargo_e_funcoes.sql foi rodado.`);
    }
    setImportando(false);
  }

  const rotuloSituacao = {
    novo: "Novo",
    existe: "Já cadastrado (ignorado)",
    cargo: "Cargo não reconhecido (ignorado)",
    turno: "Turno inválido (ignorado)",
  } as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Importar planilha</h1>
        <Link href="/colaboradores" className="botao-secundario">Voltar</Link>
      </div>
      <p className="text-neutral-700">
        Envie a planilha com as colunas <strong>Colaborador</strong>, <strong>cargo</strong>,{" "}
        <strong>turno</strong> e <strong>operação</strong>. Uma aba por unidade. O arquivo é lido no
        seu aparelho e nada é gravado antes de você confirmar.
      </p>

      <input type="file" accept=".xlsx" onChange={escolherArquivo} className="campo" />
      {lendo && <p className="text-neutral-600">Lendo a planilha…</p>}
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {resultado && (
        <p className="rounded-xl bg-green-50 p-3 text-green-800">
          {resultado} <Link href="/colaboradores" className="underline">Ver colaboradores</Link>
        </p>
      )}

      {abas.map((aba, i) => (
        <section key={aba.nome} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">Aba “{aba.nome}”</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Importar para a unidade</span>
            <select
              className="campo"
              value={aba.unidadeId}
              onChange={(e) => setAbas(abas.map((a, j) => (j === i ? { ...a, unidadeId: e.target.value } : a)))}
            >
              <option value="">Não importar esta aba</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </label>
          {aba.erro && <p className="text-red-700">{aba.erro}</p>}
          <ul className="space-y-2">
            {aba.linhas.map((l) => {
              const s = aba.unidadeId ? situacao(aba, l) : null;
              const f = funcaoDoCargo(l.cargo, l.operacao);
              return (
                <li key={l.linha} className="rounded-xl border border-neutral-200 p-3">
                  <p className="font-semibold">{l.nome}</p>
                  <p className="text-sm text-neutral-700">
                    Cargo: {l.cargo || "—"} → Função: {f ? rotuloFuncao(f) : "?"} · Turno: {l.turno ? ROTULO_TURNO[l.turno] : "?"}
                  </p>
                  {s && (
                    <p className={`text-sm ${s === "novo" ? "text-green-700" : "text-amber-700"}`}>{rotuloSituacao[s]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {abas.length > 0 && (
        <button className="botao w-full" disabled={aImportar.length === 0 || importando} onClick={importar}>
          {importando ? "Importando…" : `Importar ${aImportar.length} colaboradores`}
        </button>
      )}
    </div>
  );
}
