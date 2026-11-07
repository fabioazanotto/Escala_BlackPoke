"use client";

import { useCallback, useEffect, useState } from "react";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { Icone } from "@/components/Icones";
import { useSessao } from "@/components/Sessao";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { paraData } from "@/lib/datas";
import {
  contrariaEm,
  descreverRegra,
  NOME_DIA,
  parametrosDaRegra,
  regraDoBanco,
  ROTULO_TIPO_REGRA,
  type TipoRegra,
} from "@/lib/escala/regras";
import type { RegraMotor } from "@/lib/escala/tipos";
import { supabase } from "@/lib/supabase";
import type { Turno2 } from "@/lib/tipos";

type Pessoa = { id: string; nome: string; turno: Turno2 };
type Linha = { id: string; tipo: TipoRegra; ativa: boolean; regra: RegraMotor | null };

type Formulario = {
  tipo: TipoRegra;
  colaborador: string;
  dias: number[];
  a: string;
  b: string;
  diaA: number;
  diaB: number;
  ancora: string;
  cobre: string;
  coberto: string;
  doisSentidos: boolean;
  data: string;
  coletiva: boolean;
};

const VAZIO: Formulario = {
  tipo: "folga_fixa", colaborador: "", dias: [], a: "", b: "", diaA: 6, diaB: 0, ancora: "",
  cobre: "", coberto: "", doisSentidos: true, data: "", coletiva: true,
};

export default function RegrasDaUnidade() {
  const { perfil } = useSessao();
  const podeEditar = perfil.perfil === "rh";
  const { unidades, unidadeId, setUnidadeId, erro: erroUnidades } = useUnidades();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [ciente, setCiente] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!unidadeId) return;
    const db = supabase();
    const [c, r] = await Promise.all([
      db.from("colaboradores").select("id, nome, turno").eq("unidade_id", unidadeId).eq("ativo", true).order("nome"),
      db.from("regras_unidade").select("id, tipo, parametros, ativa").eq("unidade_id", unidadeId).order("criado_em"),
    ]);
    if (c.error || r.error) {
      setErro(`${(c.error ?? r.error)!.message}. Se a tabela não existe, rode o SQL 07_regras_da_unidade.sql.`);
      return;
    }
    setErro(null);
    setPessoas(c.data as Pessoa[]);
    setLinhas((r.data ?? []).map((x: { id: string; tipo: TipoRegra; parametros: unknown; ativa: boolean }) => ({ id: x.id, tipo: x.tipo, ativa: x.ativa, regra: regraDoBanco(x.tipo, x.parametros) })));
  }, [unidadeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const nome = useCallback((id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa inativa)", [pessoas]);

  /** Regras (uma ou duas) que o formulário geraria, ou o motivo de não poder salvar. */
  function montar(): { regras: RegraMotor[] } | { problema: string } {
    switch (form.tipo) {
      case "folga_fixa":
        if (!form.colaborador) return { problema: "Escolha a pessoa." };
        if (form.dias.length === 0) return { problema: "Marque pelo menos um dia da semana." };
        return { regras: [{ tipo: "folga_fixa", colaboradorId: form.colaborador, diasSemana: [...form.dias].sort() }] };
      case "alternancia":
        if (!form.a || !form.b) return { problema: "Escolha as duas pessoas." };
        if (form.a === form.b) return { problema: "Escolha duas pessoas diferentes." };
        if (form.diaA === form.diaB) return { problema: "Os dois dias da semana devem ser diferentes." };
        if (!form.ancora) return { problema: "Informe a data de referência." };
        if (paraData(form.ancora).getDay() !== form.diaA) return { problema: `A data de referência deve cair num(a) ${NOME_DIA[form.diaA]}, que é o dia de folga de ${nome(form.a)}.` };
        return { regras: [{ tipo: "alternancia", colaboradorA: form.a, colaboradorB: form.b, diaA: form.diaA, diaB: form.diaB, ancora: form.ancora }] };
      case "dobra": {
        if (!form.cobre || !form.coberto) return { problema: "Escolha quem dobra e quem é coberto." };
        if (form.cobre === form.coberto) return { problema: "Escolha duas pessoas diferentes." };
        const t1 = pessoas.find((p) => p.id === form.cobre)?.turno;
        const t2 = pessoas.find((p) => p.id === form.coberto)?.turno;
        if (t1 === t2) return { problema: "A dobra só faz sentido entre turnos diferentes: as duas pessoas são do mesmo turno." };
        const regras: RegraMotor[] = [{ tipo: "dobra", cobreId: form.cobre, cobertoId: form.coberto }];
        if (form.doisSentidos) regras.push({ tipo: "dobra", cobreId: form.coberto, cobertoId: form.cobre });
        return { regras };
      }
      case "dia_fechado":
        if (!form.data) return { problema: "Informe a data." };
        return { regras: [{ tipo: "dia_fechado", data: form.data, folgaColetiva: form.coletiva }] };
    }
  }

  const prevista = montar();
  const contraria = "regras" in prevista ? [...new Set(prevista.regras.flatMap(contrariaEm))] : [];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const m = montar();
    if ("problema" in m) return setErro(m.problema);
    if (contraria.length > 0 && !ciente) return setErro("Confirme que está ciente do que a regra contraria.");
    setSalvando(true);
    const { data: u } = await supabase().auth.getUser();
    const { error } = await supabase().from("regras_unidade").insert(
      m.regras.map((r) => ({
        unidade_id: unidadeId,
        tipo: r.tipo,
        nome: descreverRegra(r, nome).slice(0, 300),
        parametros: parametrosDaRegra(r),
        criada_por: u.user?.id ?? null,
      })),
    );
    setSalvando(false);
    if (error) return setErro(error.message);
    setErro(null);
    setAviso(m.regras.length > 1 ? "Regras criadas. Use “Gerar novamente” na Escala do mês para aplicá-las." : "Regra criada. Use “Gerar novamente” na Escala do mês para aplicá-la.");
    setForm(VAZIO);
    setCiente(false);
    setAberto(false);
    await carregar();
  }

  async function mudarAtiva(l: Linha) {
    const { error } = await supabase().from("regras_unidade").update({ ativa: !l.ativa }).eq("id", l.id);
    if (error) setErro(error.message);
    else {
      setAviso(null);
      await carregar();
    }
  }

  async function remover(l: Linha) {
    if (!window.confirm("Excluir esta regra? As escalas já geradas não mudam.")) return;
    const { error } = await supabase().from("regras_unidade").delete().eq("id", l.id);
    if (error) setErro(error.message);
    else await carregar();
  }

  const seletorPessoa = (valor: string, aoMudar: (v: string) => void, rotulo: string) => (
    <label className="block">
      <span className="mb-1 block font-medium">{rotulo}</span>
      <select className="campo" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">Escolha…</option>
        {pessoas.map((p) => (
          <option key={p.id} value={p.id}>{p.nome} · {p.turno === "dia" ? "dia" : "noite"}</option>
        ))}
      </select>
    </label>
  );
  const seletorDia = (valor: number, aoMudar: (v: number) => void, rotulo: string) => (
    <label className="block">
      <span className="mb-1 block font-medium">{rotulo}</span>
      <select className="campo" value={valor} onChange={(e) => aoMudar(Number(e.target.value))}>
        {NOME_DIA.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
    </label>
  );

  return (
    <div>
      <CabecalhoPagina titulo="Regras da unidade" descricao="Regras próprias de cada unidade. Elas valem ao gerar a escala; as folgas travadas à mão continuam valendo mais.">
        <SeletorUnidade filtro unidades={unidades} valor={unidadeId} aoMudar={(id) => { setAviso(null); setAberto(false); setUnidadeId(id); }} />
        {podeEditar && !aberto && <button className="botao" onClick={() => { setErro(null); setAviso(null); setAberto(true); }}>+ Nova regra</button>}
      </CabecalhoPagina>

      {(erro || erroUnidades) && <p className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">{erro ?? erroUnidades}</p>}
      {aviso && <p className="mb-4 rounded-xl bg-green-50 p-3 text-green-800">{aviso}</p>}
      {!podeEditar && <p className="mb-4 rounded-xl bg-neutral-100 p-3 text-sm">Somente o RH cria e altera regras. Você pode consultá-las aqui.</p>}

      {aberto && (
        <form onSubmit={salvar} className="cartao mb-6 max-w-2xl space-y-4">
          <h2 className="text-lg font-semibold">Nova regra</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Tipo de regra</span>
            <select className="campo" value={form.tipo} onChange={(e) => { setForm({ ...VAZIO, tipo: e.target.value as TipoRegra }); setCiente(false); }}>
              {(Object.keys(ROTULO_TIPO_REGRA) as TipoRegra[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO_REGRA[t]}</option>)}
            </select>
          </label>

          {form.tipo === "folga_fixa" && (
            <>
              {seletorPessoa(form.colaborador, (v) => setForm({ ...form, colaborador: v }), "Quem")}
              <fieldset>
                <legend className="mb-1 font-medium">Folga sempre em</legend>
                <div className="flex flex-wrap gap-2">
                  {NOME_DIA.map((d, i) => {
                    const ligado = form.dias.includes(i);
                    return (
                      <button key={d} type="button" className={ligado ? "botao" : "botao-secundario"}
                        onClick={() => setForm({ ...form, dias: ligado ? form.dias.filter((x) => x !== i) : [...form.dias, i] })}>
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {form.tipo === "alternancia" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {seletorPessoa(form.a, (v) => setForm({ ...form, a: v }), "Pessoa A")}
                {seletorDia(form.diaA, (v) => setForm({ ...form, diaA: v }), "A folga em (na semana de referência)")}
                {seletorPessoa(form.b, (v) => setForm({ ...form, b: v }), "Pessoa B")}
                {seletorDia(form.diaB, (v) => setForm({ ...form, diaB: v }), "B folga em (na semana de referência)")}
              </div>
              <label className="block">
                <span className="mb-1 block font-medium">Data de referência (um dia em que A folga)</span>
                <input className="campo" type="date" value={form.ancora} onChange={(e) => setForm({ ...form, ancora: e.target.value })} />
                <span className="mt-1 block text-sm text-neutral-600">Na semana seguinte os dois invertem, e assim por diante.</span>
              </label>
            </>
          )}

          {form.tipo === "dobra" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {seletorPessoa(form.coberto, (v) => setForm({ ...form, coberto: v }), "Quando esta pessoa folgar…")}
                {seletorPessoa(form.cobre, (v) => setForm({ ...form, cobre: v }), "…esta pessoa dobra e cobre o posto")}
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-5 w-5" checked={form.doisSentidos} onChange={(e) => setForm({ ...form, doisSentidos: e.target.checked })} />
                Nos dois sentidos (a outra pessoa também cobre quando esta folgar)
              </label>
            </>
          )}

          {form.tipo === "dia_fechado" && (
            <>
              <label className="block">
                <span className="mb-1 block font-medium">Data sem funcionamento</span>
                <input className="campo" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-5 w-5" checked={form.coletiva} onChange={(e) => setForm({ ...form, coletiva: e.target.checked })} />
                Folga coletiva: todos folgam nesse dia (vale como a folga semanal)
              </label>
            </>
          )}

          {"regras" in prevista && (
            <div className="rounded-xl bg-neutral-50 p-3 text-sm">
              <p className="font-medium">A regra ficará assim:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {prevista.regras.map((r, i) => <li key={i}>{descreverRegra(r, nome)}</li>)}
              </ul>
            </div>
          )}
          {contraria.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
              <p className="flex items-center gap-2 font-semibold"><Icone nome="alerta" tamanho={16} /> Esta regra contraria:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{contraria.map((c, i) => <li key={i}>{c}</li>)}</ul>
              <label className="mt-3 flex items-center gap-3">
                <input type="checkbox" className="h-5 w-5" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
                Estou ciente e quero criar a regra mesmo assim
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Criar regra"}</button>
            <button type="button" className="botao-secundario" onClick={() => { setAberto(false); setForm(VAZIO); setCiente(false); setErro(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      {linhas.length === 0 && <p className="text-neutral-600">Nenhuma regra criada para esta unidade ainda.</p>}
      <ul className="max-w-3xl space-y-3">
        {linhas.map((l) => (
          <li key={l.id} className={`cartao ${l.ativa ? "" : "opacity-60"}`}>
            <p className="text-sm font-semibold text-neutral-600">{ROTULO_TIPO_REGRA[l.tipo]}{!l.ativa && " · desativada"}</p>
            <p className="mt-1">{l.regra ? descreverRegra(l.regra, nome) : "Regra incompleta (ignorada pelo sistema)."}</p>
            {l.regra && contrariaEm(l.regra).length > 0 && (
              <p className="mt-2 text-sm text-amber-900">Contraria: {contrariaEm(l.regra).join(" ")}</p>
            )}
            {podeEditar && (
              <div className="mt-3 flex gap-2">
                <button className="botao-secundario" onClick={() => mudarAtiva(l)}>{l.ativa ? "Desativar" : "Reativar"}</button>
                <button className="botao-secundario" onClick={() => remover(l)}>Excluir</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
