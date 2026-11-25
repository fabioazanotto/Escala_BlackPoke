"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { dataBR, hojeISO } from "@/lib/datas";
import { ROTULO_TURNO, rotuloFuncao } from "@/lib/funcoes";
import { avisosDaTransferencia, mesesComDiasAposData, regrasQueCitam, validarTransferencia, type DiaAgendado, type RegraLida } from "@/lib/transferencia";
import type { Colaborador, Funcao, Unidade } from "@/lib/tipos";

type Transferencia = { id: string; criado_em: string; unidade_origem_id: string; unidade_destino_id: string; data_inicio: string; usuario_nome: string | null };

/**
 * Transferir um colaborador para outra unidade (só o BlackPoke). Mostra o que muda e o que o app NÃO mexe (a escala),
 * e grava tudo de uma vez numa função do banco. A mudança de empresa no Secullum entra numa etapa seguinte.
 */
export function TransferirColaborador({ colaborador, unidades, onFechar, onConcluido }: { colaborador: Colaborador; unidades: Unidade[]; onFechar: () => void; onConcluido: () => void }) {
  const { perfil } = useSessao();
  const destinos = unidades.filter((u) => u.id !== colaborador.unidade_id);
  const [destino, setDestino] = useState(destinos[0]?.id ?? "");
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [funcao, setFuncao] = useState("");
  const [turno, setTurno] = useState<string>(colaborador.turno);
  const [data, setData] = useState(() => hojeISO());
  const [observacao, setObservacao] = useState("");
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [historico, setHistorico] = useState<Transferencia[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState<{ avisos: string[] } | null>(null);

  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "?";

  // Funções da unidade de destino.
  useEffect(() => {
    if (!destino) return;
    let ativo = true;
    supabase()
      .from("funcoes")
      .select("id, unidade_id, nome, operacao, ativa")
      .eq("unidade_id", destino)
      .eq("ativa", true)
      .order("nome")
      .then(({ data: d, error }) => {
        if (!ativo) return;
        if (error) return setErro(error.message);
        const lista = (d ?? []) as Funcao[];
        setFuncoes(lista);
        setFuncao((atual) => (lista.some((f) => f.id === atual) ? atual : (lista[0]?.id ?? "")));
      });
    return () => {
      ativo = false;
    };
  }, [destino]);

  // Transferências anteriores deste colaborador.
  useEffect(() => {
    let ativo = true;
    supabase()
      .from("transferencias_colaboradores")
      .select("id, criado_em, unidade_origem_id, unidade_destino_id, data_inicio, usuario_nome")
      .eq("colaborador_id", colaborador.id)
      .order("criado_em", { ascending: false })
      .limit(5)
      .then(({ data: d }) => ativo && setHistorico((d ?? []) as Transferencia[]));
    return () => {
      ativo = false;
    };
  }, [colaborador.id, feito]);

  async function levantarAvisos(): Promise<string[]> {
    const db = supabase();
    const [dias, extras, regras, repetida] = await Promise.all([
      db.from("escala_dias").select("data, situacao, escalas_mensais!inner(ano, mes, status, unidade_id)").eq("colaborador_id", colaborador.id).eq("escalas_mensais.unidade_id", colaborador.unidade_id).gte("data", data),
      db.from("colaborador_funcoes").select("funcao_id", { count: "exact", head: true }).eq("colaborador_id", colaborador.id),
      db.from("regras_unidade").select("id, tipo, nome, parametros").eq("unidade_id", colaborador.unidade_id).eq("ativa", true),
      colaborador.matricula ? db.from("colaboradores").select("id", { count: "exact", head: true }).eq("unidade_id", destino).eq("matricula", colaborador.matricula) : Promise.resolve({ count: 0, error: null }),
    ]);
    const falha = dias.error ?? extras.error ?? regras.error ?? repetida.error;
    if (falha) throw falha;
    const linhas: DiaAgendado[] = (dias.data ?? []).map((l) => {
      const e = l.escalas_mensais as unknown as { ano: number; mes: number; status: string };
      return { data: String(l.data), situacao: String(l.situacao), ano: e.ano, mes: e.mes, status: e.status };
    });
    return avisosDaTransferencia({
      meses: mesesComDiasAposData(linhas, data),
      funcoesAdicionais: extras.count ?? 0,
      regras: regrasQueCitam((regras.data ?? []) as RegraLida[], colaborador.id),
      matriculaRepetida: (repetida.count ?? 0) > 0,
    });
  }

  async function conferir() {
    const problema = validarTransferencia({ origem: colaborador.unidade_id, destino, funcao, turno, data });
    if (problema) return setErro(problema);
    setOcupado(true);
    setErro(null);
    try {
      setAvisos(await levantarAvisos());
    } catch (e) {
      setErro((e as { message?: string }).message ?? String(e));
    }
    setOcupado(false);
  }

  async function transferir() {
    setOcupado(true);
    setErro(null);
    const { error } = await supabase().rpc("transferir_colaborador", { p_colaborador: colaborador.id, p_unidade_destino: destino, p_funcao_destino: funcao, p_turno: turno, p_data: data, p_observacao: observacao, p_usuario_nome: perfil.nome });
    if (error) {
      setOcupado(false);
      return setErro(error.message);
    }
    setFeito({ avisos: avisos ?? [] });
    setOcupado(false);
    onConcluido();
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-transf" className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button aria-label="Fechar" className="absolute inset-0 bg-black/50" onClick={onFechar} />
      <div className="relative max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div>
          <h2 id="titulo-transf" className="text-lg font-semibold">Transferir colaborador</h2>
          <p className="text-sm text-neutral-600">
            {colaborador.nome_completo || colaborador.nome} · hoje em <strong>{nomeUnidade(colaborador.unidade_id)}</strong>
          </p>
        </div>

        {feito ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
              Transferido para <strong>{nomeUnidade(destino)}</strong> a partir de {dataBR(data)}. O histórico ficou registrado.
            </p>
            {feito.avisos.map((a) => (
              <p key={a} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{a}</p>
            ))}
            <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-800">
              <strong>Secullum:</strong> a empresa do cadastro dele no Secullum <strong>ainda não foi alterada</strong>. Mude lá por enquanto; a mudança automática entra numa etapa seguinte.
            </p>
            <button className="botao w-full" onClick={onFechar}>Fechar</button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Unidade de destino</span>
                <select className="campo" value={destino} onChange={(e) => { setDestino(e.target.value); setAvisos(null); }}>
                  {destinos.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Função na unidade nova</span>
                  <select className="campo" value={funcao} onChange={(e) => { setFuncao(e.target.value); setAvisos(null); }}>
                    {funcoes.map((f) => (
                      <option key={f.id} value={f.id}>{rotuloFuncao(f)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Turno</span>
                  <select className="campo" value={turno} onChange={(e) => { setTurno(e.target.value); setAvisos(null); }}>
                    {(["dia", "noite"] as const).map((t) => (
                      <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Vale a partir de</span>
                <input className="campo" type="date" value={data} onChange={(e) => { setData(e.target.value); setAvisos(null); }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Observação (opcional)</span>
                <input className="campo" maxLength={200} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </label>
              <label className="flex items-start gap-2 text-sm text-neutral-500">
                <input type="checkbox" className="mt-0.5 h-5 w-5" disabled />
                <span>Também mudar a empresa no Secullum <em>(disponível em breve; por enquanto mude no próprio Secullum)</em></span>
              </label>
            </div>

            {avisos && (
              <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <p className="font-semibold">O que vai mudar</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  <li>Unidade: {nomeUnidade(colaborador.unidade_id)} → <strong>{nomeUnidade(destino)}</strong></li>
                  <li>Função: <strong>{rotuloFuncao(funcoes.find((f) => f.id === funcao) ?? ({ nome: "?", operacao: null } as Funcao))}</strong> · turno {ROTULO_TURNO[turno as "dia" | "noite"]?.toLowerCase()}</li>
                  <li>Vale a partir de {dataBR(data)}. A escala <strong>não é alterada</strong>.</li>
                </ul>
                {avisos.length === 0 ? <p className="text-sm text-green-800">Nada a avisar: sem dias escalados a partir dessa data, sem funções adicionais e sem regras da unidade ligadas a ele.</p> : avisos.map((a) => (
                  <p key={a} className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{a}</p>
                ))}
              </div>
            )}

            {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

            <div className="flex flex-wrap gap-2">
              {avisos ? (
                <>
                  <button className="botao" disabled={ocupado || avisos.some((a) => a.startsWith("Já existe alguém com a mesma matrícula"))} onClick={() => void transferir()}>
                    {ocupado ? "Transferindo…" : "Confirmar transferência"}
                  </button>
                  <button className="botao-secundario" disabled={ocupado} onClick={() => setAvisos(null)}>Voltar</button>
                </>
              ) : (
                <>
                  <button className="botao" disabled={ocupado || funcoes.length === 0} onClick={() => void conferir()}>
                    {ocupado ? "Conferindo…" : "Ver o que vai mudar"}
                  </button>
                  <button className="botao-secundario" onClick={onFechar}>Cancelar</button>
                </>
              )}
            </div>
            {funcoes.length === 0 && destino && <p className="text-sm text-amber-800">A unidade de destino não tem funções ativas. Cadastre uma em Configurações → Funções.</p>}

            {historico.length > 0 && (
              <div className="border-t border-neutral-200 pt-3">
                <p className="text-sm font-semibold">Transferências anteriores</p>
                <ul className="mt-1 space-y-0.5 text-sm text-neutral-700">
                  {historico.map((h) => (
                    <li key={h.id}>
                      {dataBR(h.data_inicio)}: {nomeUnidade(h.unidade_origem_id)} → {nomeUnidade(h.unidade_destino_id)}
                      {h.usuario_nome ? ` (por ${h.usuario_nome})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
