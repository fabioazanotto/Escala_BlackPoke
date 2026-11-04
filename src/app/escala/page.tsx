"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  somarDias,
} from "@/lib/datas";

type Celula = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [aberta, setAberta] = useState<Celula | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const dias = diasDaSemana(segunda);

  const carregar = useCallback(async () => {
    if (!variaveisConfiguradas()) {
      setErro("As variáveis do Supabase não foram configuradas.");
      setCarregando(false);
      return;
    }
    const db = supabase();
    const [t, f, e] = await Promise.all([
      db.from("turnos").select("*").order("ordem"),
      db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
      db
        .from("escalas")
        .select("id, data, turno_id, funcionario_id")
        .gte("data", segunda)
        .lte("data", somarDias(segunda, 6)),
    ]);
    const falha = t.error || f.error || e.error;
    if (falha) setErro(falha.message);
    else {
      setErro(null);
      setTurnos(t.data as Turno[]);
      setFuncionarios(f.data as Funcionario[]);
      setEscalas(e.data as Escala[]);
    }
    setCarregando(false);
  }, [segunda]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  function irParaSemana(nova: string) {
    setAberta(null);
    setCarregando(true);
    setSegunda(nova);
  }

  function escalaDaCelula(c: Celula) {
    return escalas.filter((x) => x.data === c.data && x.turno_id === c.turno.id);
  }

  async function alternar(c: Celula, funcionario: Funcionario) {
    const existente = escalaDaCelula(c).find((x) => x.funcionario_id === funcionario.id);
    const db = supabase();
    if (existente) {
      const { error } = await db.from("escalas").delete().eq("id", existente.id);
      if (error) return setErro(error.message);
      setEscalas((l) => l.filter((x) => x.id !== existente.id));
    } else {
      const { data, error } = await db
        .from("escalas")
        .insert({ data: c.data, turno_id: c.turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) return setErro(error.message);
      setEscalas((l) => [...l, data as Escala]);
    }
    setErro(null);
  }

  const nomePorId = new Map(funcionarios.map((f) => [f.id, f]));
  const fim = somarDias(segunda, 6);
  const ehEstaSemana = segunda === inicioDaSemana(hojeISO());

  // Lista da célula aberta: ativos + desativados que já estavam escalados nela.
  const listaDaCelula = aberta
    ? funcionarios.filter(
        (f) =>
          f.ativo || escalaDaCelula(aberta).some((x) => x.funcionario_id === f.id),
      )
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          {diaMes(segunda)} a {diaMes(fim)}
        </p>
        <div className="flex gap-2">
          <button className="botao-secundario flex-1" onClick={() => irParaSemana(somarDias(segunda, -7))}>
            ◀ Anterior
          </button>
          <button className="botao-secundario flex-1" onClick={() => irParaSemana(somarDias(segunda, 7))}>
            Próxima ▶
          </button>
        </div>
        {!ehEstaSemana && (
          <button className="botao w-full" onClick={() => irParaSemana(inicioDaSemana(hojeISO()))}>
            Voltar para esta semana
          </button>
        )}
      </div>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {carregando && <p className="text-neutral-600">Carregando…</p>}

      {!carregando && (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] w-24 border-b bg-white p-2 text-left" />
                {dias.map((d) => (
                  <th
                    key={d}
                    className={`border-b p-2 text-center ${d === hojeISO() ? "bg-amber-50" : ""}`}
                  >
                    <div>{DIAS_SEMANA[paraData(d).getDay()]}</div>
                    <div className="font-normal text-neutral-600">{diaMes(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {turnos.map((turno) => (
                <tr key={turno.id}>
                  <th className="sticky left-0 z-[1] border-b bg-white p-2 text-left align-top">
                    <div className="text-base">{turno.nome}</div>
                    <div className="font-normal text-neutral-600">
                      {horaCurta(turno.hora_inicio)}–{horaCurta(turno.hora_fim)}
                    </div>
                  </th>
                  {dias.map((d) => {
                    const c = { data: d, turno };
                    const nomes = escalaDaCelula(c)
                      .map((x) => nomePorId.get(x.funcionario_id)?.nome)
                      .filter(Boolean) as string[];
                    const selecionada = aberta?.data === d && aberta.turno.id === turno.id;
                    return (
                      <td key={d} className="border-b p-1 align-top">
                        <button
                          onClick={() => setAberta(c)}
                          className={`min-h-20 w-full rounded-lg p-2 text-left active:scale-[0.98] ${
                            selecionada ? "bg-blue-100 ring-2 ring-blue-400" : "bg-neutral-50"
                          }`}
                        >
                          {nomes.length === 0 ? (
                            <span className="text-neutral-400">+ Escolher</span>
                          ) : (
                            nomes.map((n) => <div key={n}>{n.split(" ")[0]}</div>)
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberta && (
        <section className="cartao space-y-3">
          <h2 className="text-lg font-semibold">
            {aberta.turno.nome} · {DIAS_SEMANA[paraData(aberta.data).getDay()]} {diaMes(aberta.data)}
          </h2>
          <p className="text-neutral-600">Toque no nome para escalar ou tirar da escala.</p>
          <ul className="space-y-2">
            {listaDaCelula.map((f) => {
              const marcado = escalaDaCelula(aberta).some((x) => x.funcionario_id === f.id);
              return (
                <li key={f.id}>
                  <button
                    onClick={() => alternar(aberta, f)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-base ${
                      marcado
                        ? "border-green-600 bg-green-50 font-semibold"
                        : "border-neutral-300 bg-white"
                    }`}
                  >
                    <span>
                      {f.nome} <span className="text-neutral-600">· {f.funcao}</span>
                      {!f.ativo && <span className="text-neutral-500"> (desativado)</span>}
                    </span>
                    <span className="text-xl">{marcado ? "✓" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="botao w-full" onClick={() => setAberta(null)}>
            Pronto
          </button>
        </section>
      )}
    </div>
  );
}
