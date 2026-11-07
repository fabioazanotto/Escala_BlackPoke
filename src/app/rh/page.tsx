"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { GraficoCobertura, type PontoCobertura } from "@/components/GraficoCobertura";
import { Icone } from "@/components/Icones";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { DIAS_SEMANA_CURTO, dataBR, hojeISO, paraData } from "@/lib/datas";
import { diasDoMes, avaliarEscala } from "@/lib/escala/motor";
import { carregarDados, ROTULO_STATUS, type Dados } from "@/lib/escala/carregar";
import type { ResultadoMotor } from "@/lib/escala/tipos";
import { ROTULO_TURNO, rotuloFuncao } from "@/lib/funcoes";

function Indicador({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string | number; detalhe: string; alerta?: boolean }) {
  return (
    <div className="cartao">
      <p className="text-sm text-neutral-600">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      <p className={`mt-1 text-xs ${alerta ? "font-medium text-red-700" : "text-neutral-500"}`}>{detalhe}</p>
    </div>
  );
}

type Prioridade = { icone: "alerta" | "info" | "ok"; texto: string; href: string };

export default function VisaoGeralRH() {
  const { unidades, unidadeId, setUnidadeId, erro: erroUnidades } = useUnidades();
  const [mesAno, setMesAno] = useState(() => hojeISO().slice(0, 7));
  const [dados, setDados] = useState<Dados | null>(null);
  const [resultado, setResultado] = useState<ResultadoMotor | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [ano, mes] = mesAno.split("-").map(Number);
  const mesValido = Number.isInteger(ano) && Number.isInteger(mes) && mes >= 1 && mes <= 12;

  useEffect(() => {
    if (!unidadeId || !mesValido) return;
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    carregarDados(unidadeId, ano, mes)
      .then((d) => {
        if (cancelado) return;
        setDados(d);
        setResultado(d.celulasSalvas ? avaliarEscala(d.entrada, d.celulasSalvas) : null);
        setErro(null);
      })
      .catch((ex) => {
        if (cancelado) return;
        setDados(null);
        setResultado(null);
        setErro(`${(ex as { message?: string }).message ?? String(ex)}. Se a tabela não existe, rode o SQL 05_escala_mensal.sql.`);
      })
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [unidadeId, ano, mes, mesValido]);

  const pontos: PontoCobertura[] = useMemo(() => {
    if (!resultado || !mesValido) return [];
    return diasDoMes(ano, mes).map((d) => {
      let deficit = 0;
      let reduzida = 0;
      for (const x of resultado.cobertura) {
        if (x.data !== d) continue;
        deficit += Math.max(0, x.minimo - x.presentes);
        reduzida += Math.max(0, x.ideal - Math.max(x.presentes, x.minimo));
      }
      return { data: d, deficit, reduzida };
    });
  }, [resultado, ano, mes, mesValido]);

  const prioridades: Prioridade[] = useMemo(() => {
    if (!dados) return [];
    const lista: Prioridade[] = [];
    if (!resultado) {
      lista.push({ icone: "info", texto: "Ainda não há escala para este mês. Gere o rascunho para ver a cobertura.", href: "/escala-mensal" });
      return lista;
    }
    if (dados.escala && dados.escala.status !== "publicada") {
      lista.push({ icone: "info", texto: `Escala em “${ROTULO_STATUS[dados.escala.status]}”: revise e publique quando estiver pronta.`, href: "/escala-mensal" });
    }
    if (resultado.conflitos.length > 0) {
      lista.push({ icone: "alerta", texto: `${resultado.conflitos.length} conflito(s) com exigências trabalhistas validadas.`, href: "/escala-mensal" });
    }
    const piores = [...pontos].filter((p) => p.deficit > 0).sort((a, b) => b.deficit - a.deficit || a.data.localeCompare(b.data)).slice(0, 3);
    for (const p of piores) {
      lista.push({
        icone: "alerta",
        texto: `${DIAS_SEMANA_CURTO[paraData(p.data).getDay()]} ${dataBR(p.data).slice(0, 5)}: ${p.deficit} pessoa(s) faltando.`,
        href: "/escala-mensal",
      });
    }
    if (resultado.resumo.legaisNaoVerificados > 0) {
      lista.push({ icone: "info", texto: `${resultado.resumo.legaisNaoVerificados} exigência(s) trabalhista(s) ainda sem validação.`, href: "/regras" });
    }
    if (lista.length === 0) lista.push({ icone: "ok", texto: "Sem pendências para este mês.", href: "/escala-mensal" });
    return lista;
  }, [dados, resultado, pontos]);

  const linhas = useMemo(() => {
    if (!dados || !resultado) return [];
    return dados.entrada.colaboradores.map((c) => {
      const dias = resultado.dias.map((d) => resultado.celulas[c.id]?.[d] ?? "trabalha");
      const conta = (...s: string[]) => dias.filter((x) => s.includes(x)).length;
      const f = dados.funcoes.get(c.funcaoPrincipalId);
      return {
        id: c.id,
        nome: c.nome,
        funcao: f ? rotuloFuncao(f) : "—",
        turno: c.turno,
        folgas: conta("folga"),
        domingos: conta("domingo"),
        ausencias: conta("ferias", "afastamento", "indisponibilidade"),
        dobras: conta("dobra"),
        trabalhados: conta("trabalha", "dobra"),
      };
    });
  }, [dados, resultado]);

  const r = resultado?.resumo;
  const turnos = dados ? { dia: dados.entrada.colaboradores.filter((c) => c.turno === "dia").length, noite: dados.entrada.colaboradores.filter((c) => c.turno === "noite").length } : null;

  return (
    <div>
      <CabecalhoPagina titulo="Visão geral do RH">
        <SeletorUnidade filtro unidades={unidades} valor={unidadeId} aoMudar={setUnidadeId} />
        <input aria-label="Mês" className="filtro" type="month" value={mesAno} onChange={(e) => setMesAno(e.target.value)} />
      </CabecalhoPagina>

      {(erro || erroUnidades) && <p className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">{erro ?? erroUnidades}</p>}
      {carregando && <p className="mb-4 text-sm text-neutral-600">Carregando…</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador
          rotulo="Colaboradores ativos"
          valor={dados ? dados.entrada.colaboradores.length : "—"}
          detalhe={turnos ? `${turnos.dia} no dia · ${turnos.noite} na noite` : " "}
        />
        <Indicador
          rotulo="Dias com cobertura completa"
          valor={r ? r.diasCompletos : "—"}
          detalhe={r ? `${r.diasReduzidos} com reduzida autorizada` : "Sem escala gerada"}
        />
        <Indicador
          rotulo="Dias com déficit"
          valor={r ? r.diasComDeficit : "—"}
          detalhe={r ? (r.diasComDeficit > 0 ? "Veja as prioridades" : "Nenhum dia descoberto") : "Sem escala gerada"}
          alerta={!!r && r.diasComDeficit > 0}
        />
        <Indicador
          rotulo="Conflitos trabalhistas"
          valor={r ? r.conflitos : "—"}
          detalhe={r ? (r.legaisNaoVerificados > 0 ? `${r.legaisNaoVerificados} exigência(s) sem validação` : "Todas as exigências verificadas") : "Sem escala gerada"}
          alerta={!!r && r.conflitos > 0}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="cartao lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">Cobertura por dia</h2>
          {pontos.length > 0 ? (
            <GraficoCobertura pontos={pontos} feriados={resultado?.feriados ?? []} />
          ) : (
            <div className="flex h-[250px] flex-col items-center justify-center gap-3 text-center text-sm text-neutral-600">
              <p>Gere a escala do mês para ver a cobertura de cada dia.</p>
              <Link href="/escala-mensal" className="botao">Ir para Escala do mês</Link>
            </div>
          )}
        </section>

        <section className="cartao">
          <h2 className="mb-3 text-base font-semibold">Prioridades</h2>
          {prioridades.length === 0 && <p className="text-sm text-neutral-600">Escolha uma unidade e um mês.</p>}
          <ul className="space-y-1">
            {prioridades.map((p, i) => (
              <li key={i}>
                <Link href={p.href} className="flex items-start gap-3 rounded-lg p-2 text-sm hover:bg-neutral-50">
                  <Icone nome={p.icone} tamanho={18} className={`mt-0.5 shrink-0 ${p.icone === "alerta" ? "text-red-700" : p.icone === "ok" ? "text-green-700" : "text-neutral-500"}`} />
                  <span>{p.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="cartao mt-4 !p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-5 py-4">
          <h2 className="text-base font-semibold">Folgas por colaborador</h2>
          {r && (
            <p className="text-sm text-neutral-600">
              {r.folgasProgramadas} folgas programadas · {r.domingosDistribuidos} domingos de descanso
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-600">
              <tr>
                <th className="px-5 py-2.5 font-medium">Colaborador</th>
                <th className="px-3 py-2.5 font-medium">Função</th>
                <th className="px-3 py-2.5 font-medium">Turno</th>
                <th className="px-3 py-2.5 text-right font-medium">Folgas</th>
                <th className="px-3 py-2.5 text-right font-medium">Domingo de descanso</th>
                <th className="px-3 py-2.5 text-right font-medium">Ausências (dias)</th>
                <th className="px-3 py-2.5 text-right font-medium">Dobras</th>
                <th className="px-5 py-2.5 text-right font-medium">Dias trabalhados</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.map((l) => (
                <tr key={l.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-5 py-2.5 font-medium">{l.nome}</td>
                  <td className="px-3 py-2.5">{l.funcao}</td>
                  <td className="px-3 py-2.5">{ROTULO_TURNO[l.turno]}</td>
                  <td className="px-3 py-2.5 text-right">{l.folgas}</td>
                  <td className="px-3 py-2.5 text-right">{l.domingos}</td>
                  <td className="px-3 py-2.5 text-right">{l.ausencias}</td>
                  <td className="px-3 py-2.5 text-right">{l.dobras}</td>
                  <td className="px-5 py-2.5 text-right">{l.trabalhados}</td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-neutral-600">
                    {dados && !resultado ? "Sem escala gerada para este mês." : "Nada para mostrar ainda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
