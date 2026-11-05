"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { DIAS_SEMANA_CURTO, duracaoMinutos, formatarMinutos, horaCurta } from "@/lib/datas";
import { ROTULO_TURNO } from "@/lib/funcoes";
import type { Funcionamento, Jornada } from "@/lib/tipos";

export default function Horarios() {
  const { perfil } = useSessao();
  const podeEditar = perfil.perfil === "rh";
  const { unidades, unidadeId, setUnidadeId, erro: erroUnidades } = useUnidades();
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [atendimento, setAtendimento] = useState<Funcionamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!unidadeId) return;
    const db = supabase();
    const [j, f] = await Promise.all([
      db.from("jornadas").select("*").eq("unidade_id", unidadeId).order("turno"),
      db.from("funcionamento").select("*").eq("unidade_id", unidadeId).order("hora_inicio"),
    ]);
    if (j.error || f.error) return setErro((j.error ?? f.error)!.message);
    setErro(null);
    setJornadas(j.data as Jornada[]);
    setAtendimento(f.data as Funcionamento[]);
  }, [unidadeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function salvarJornada(j: Jornada) {
    if (!j.hora_inicio || !j.hora_fim) return setErro("Preencha o início e o fim da jornada.");
    const { error } = await supabase()
      .from("jornadas")
      .update({ hora_inicio: j.hora_inicio, hora_fim: j.hora_fim, intervalo_minutos: j.intervalo_minutos })
      .eq("id", j.id);
    if (error) return setErro(error.message);
    setErro(null);
    setAviso(`Jornada do turno ${ROTULO_TURNO[j.turno].toLowerCase()} salva.`);
  }

  async function salvarAtendimento(f: Funcionamento) {
    if (!f.hora_inicio || !f.hora_fim) return setErro("Preencha o início e o fim do atendimento.");
    if (f.dias_semana.length === 0) return setErro("Marque pelo menos um dia de funcionamento.");
    const { error } = await supabase()
      .from("funcionamento")
      .update({ hora_inicio: f.hora_inicio, hora_fim: f.hora_fim, dias_semana: f.dias_semana })
      .eq("id", f.id);
    if (error) return setErro(error.message);
    setErro(null);
    setAviso(`Atendimento “${f.nome}” salvo.`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Horários</h1>
      <SeletorUnidade unidades={unidades} valor={unidadeId} aoMudar={(id) => { setAviso(null); setUnidadeId(id); }} />
      {(erro || erroUnidades) && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro ?? erroUnidades}</p>}
      {aviso && <p className="rounded-xl bg-green-50 p-3 text-green-800">{aviso}</p>}

      <h2 className="text-xl font-semibold">Jornadas dos colaboradores</h2>
      <p className="text-neutral-700">O intervalo é só a duração: não há horário fixo de descanso.</p>
      {jornadas.map((j, i) => {
        const total = j.hora_inicio && j.hora_fim ? duracaoMinutos(j.hora_inicio, j.hora_fim) : 0;
        const viraDia = j.hora_inicio && j.hora_fim && j.hora_fim <= j.hora_inicio;
        const mudar = (campo: Partial<Jornada>) =>
          setJornadas(jornadas.map((x, k) => (k === i ? { ...x, ...campo } : x)));
        return (
          <section key={j.id} className="cartao space-y-3">
            <h3 className="text-lg font-semibold">Turno {ROTULO_TURNO[j.turno].toLowerCase()}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block font-medium">Entrada</span>
                <input className="campo" type="time" disabled={!podeEditar} value={horaCurta(j.hora_inicio)} onChange={(e) => mudar({ hora_inicio: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Saída</span>
                <input className="campo" type="time" disabled={!podeEditar} value={horaCurta(j.hora_fim)} onChange={(e) => mudar({ hora_fim: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block font-medium">Intervalo (minutos)</span>
              <input className="campo" type="number" min={0} disabled={!podeEditar} value={j.intervalo_minutos} onChange={(e) => mudar({ intervalo_minutos: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <p className="text-neutral-700">
              Jornada de {formatarMinutos(total)} ({formatarMinutos(Math.max(0, total - j.intervalo_minutos))} efetivas)
              {viraDia ? " · termina às " + horaCurta(j.hora_fim) + " do dia seguinte" : ""}.
            </p>
            {podeEditar && <button className="botao w-full" onClick={() => salvarJornada(j)}>Salvar</button>}
          </section>
        );
      })}

      <h2 className="text-xl font-semibold">Atendimento ao público e delivery</h2>
      {atendimento.map((f, i) => {
        const mudar = (campo: Partial<Funcionamento>) =>
          setAtendimento(atendimento.map((x, k) => (k === i ? { ...x, ...campo } : x)));
        return (
          <section key={f.id} className="cartao space-y-3">
            <h3 className="text-lg font-semibold">{f.nome}</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block font-medium">Abre</span>
                <input className="campo" type="time" disabled={!podeEditar} value={horaCurta(f.hora_inicio)} onChange={(e) => mudar({ hora_inicio: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Fecha</span>
                <input className="campo" type="time" disabled={!podeEditar} value={horaCurta(f.hora_fim)} onChange={(e) => mudar({ hora_fim: e.target.value })} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA_CURTO.map((nome, d) => {
                const ligado = f.dias_semana.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!podeEditar}
                    onClick={() => mudar({ dias_semana: ligado ? f.dias_semana.filter((x) => x !== d) : [...f.dias_semana, d].sort() })}
                    className={ligado ? "botao" : "botao-secundario"}
                  >
                    {nome}
                  </button>
                );
              })}
            </div>
            {podeEditar && <button className="botao w-full" onClick={() => salvarAtendimento(f)}>Salvar</button>}
          </section>
        );
      })}
    </div>
  );
}
