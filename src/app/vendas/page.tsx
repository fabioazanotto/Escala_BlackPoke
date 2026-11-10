"use client";

import { useEffect, useMemo, useState } from "react";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { ConexaoXmenu } from "@/components/vendas/ConexaoXmenu";
import { FiltrosLojasCanais, SeletorPeriodo } from "@/components/vendas/FiltrosVendas";
import { GraficoVendas } from "@/components/vendas/GraficoVendas";
import { IndicadoresVendas } from "@/components/vendas/IndicadoresVendas";
import { ParticipacaoCanais } from "@/components/vendas/ParticipacaoCanais";
import { SincronizacaoVendas } from "@/components/vendas/SincronizacaoVendas";
import { TabelaLojas } from "@/components/vendas/TabelaLojas";
import type { CanalVenda } from "@/lib/tipos";
import { carregarLinhas, carregarLojas, type LojaVenda } from "@/lib/vendas/carregar";
import { CANAIS, filtrar, periodoAnterior, periodoDoTipo, somar, type LinhaVenda, type Periodo, type TipoPeriodo } from "@/lib/vendas/consulta";
import { hojeNoBrasil, somarDiasData } from "@/lib/vendas/datas";
import { dataBR, diaCurto } from "@/lib/vendas/formatar";

type Carga = { chave: string; atual: LinhaVenda[]; anterior: LinhaVenda[] };

export default function Vendas() {
  const [hoje] = useState(() => hojeNoBrasil());
  const [tipo, setTipo] = useState<TipoPeriodo>("ontem");
  const [datas, setDatas] = useState({ de: somarDiasData(hoje, -6), ate: hoje });
  const [lojas, setLojas] = useState<LojaVenda[] | null>(null);
  const [lojasSel, setLojasSel] = useState<string[] | null>(null);
  const [canaisSel, setCanaisSel] = useState<CanalVenda[]>(CANAIS);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [erro, setErro] = useState<{ chave: string; texto: string } | null>(null);

  const periodo: Periodo = tipo === "personalizado" ? { tipo, ...datas } : periodoDoTipo(tipo, hoje);
  const anterior = periodoAnterior(periodo);
  const chave = `${periodo.de}|${periodo.ate}`;

  useEffect(() => {
    let cancelado = false;
    carregarLojas()
      .then((l) => !cancelado && setLojas(l))
      .catch((e) => !cancelado && setErro({ chave: "lojas", texto: (e as Error).message }));
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!lojas) return;
    let cancelado = false;
    Promise.all([carregarLinhas(periodo.de, periodo.ate, lojas), carregarLinhas(anterior.de, anterior.ate, lojas)])
      .then(([atual, ant]) => !cancelado && setCarga({ chave, atual, anterior: ant }))
      .catch((e) => !cancelado && setErro({ chave, texto: (e as Error).message }));
    return () => {
      cancelado = true;
    };
    // O período inteiro está resumido em "chave".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojas, chave]);

  const todasChaves = useMemo(() => lojas?.map((l) => l.chave) ?? [], [lojas]);
  const lojasAtivas = lojasSel ?? todasChaves;
  const lojasEscolhidas = (lojas ?? []).filter((l) => lojasAtivas.includes(l.chave));
  // Lista vazia significa "todas".
  const filtroLojas = lojasAtivas.length === todasChaves.length ? "" : lojasAtivas.join(",");
  const filtroCanais = canaisSel.length === CANAIS.length ? "" : canaisSel.join(",");

  const carregando = !carga || carga.chave !== chave;
  const linhas = useMemo(() => {
    if (!carga) return [];
    return filtrar(carga.atual, { lojas: filtroLojas ? filtroLojas.split(",") : [], canais: filtroCanais ? (filtroCanais.split(",") as CanalVenda[]) : [] });
  }, [carga, filtroLojas, filtroCanais]);
  const linhasAnt = useMemo(() => {
    if (!carga) return [];
    return filtrar(carga.anterior, { lojas: filtroLojas ? filtroLojas.split(",") : [], canais: filtroCanais ? (filtroCanais.split(",") as CanalVenda[]) : [] });
  }, [carga, filtroLojas, filtroCanais]);
  const totais = useMemo(() => somar(linhas), [linhas]);
  const totaisAnt = useMemo(() => somar(linhasAnt), [linhasAnt]);
  const porCanal = useMemo(() => {
    const r = {} as Record<CanalVenda, ReturnType<typeof somar>>;
    for (const c of CANAIS) r[c] = somar(linhas.filter((l) => l.canal === c));
    return r;
  }, [linhas]);

  // Aviso quando o período começa antes do histórico já carregado de alguma loja escolhida.
  const incompletas = periodo.de >= somarDiasData(hoje, -2) ? [] : lojasEscolhidas.filter((l) => !l.historicoDesde || l.historicoDesde > periodo.de);

  const textoPeriodo = periodo.de === periodo.ate ? `${diaCurto(periodo.de)}/${periodo.de.slice(0, 4)}` : `${dataBR(periodo.de)} a ${dataBR(periodo.ate)}`;
  const erroTela = erro && (erro.chave === "lojas" || erro.chave === chave) ? erro.texto : null;

  return (
    <div>
      <CabecalhoPagina titulo="Vendas" descricao={`Dia de caixa: ${textoPeriodo}. Todas as lojas do Xmenu, em um só lugar.`}>
        <SeletorPeriodo tipo={tipo} de={periodo.de} ate={periodo.ate} hoje={hoje} aoMudarTipo={setTipo} aoMudarDatas={(de, ate) => setDatas({ de, ate })} />
      </CabecalhoPagina>

      {lojas && <FiltrosLojasCanais lojas={lojas} lojasSel={lojasAtivas} aoMudarLojas={setLojasSel} canaisSel={canaisSel} aoMudarCanais={setCanaisSel} />}

      {erroTela && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-red-700">
          Não consegui ler as vendas: {erroTela}. Se a tabela não existe, rode o SQL 09_vendas.sql.
        </p>
      )}

      {incompletas.length > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          O histórico ainda está sendo carregado, então este período pode estar incompleto em:{" "}
          {incompletas.map((l) => `${l.nome.replace("BlackPoke ", "")} (carregado ${l.historicoDesde ? `desde ${dataBR(l.historicoDesde)}` : "ainda não começou"})`).join("; ")}. Ele se completa sozinho.
        </p>
      )}

      {!erroTela && carregando && <p className="mb-4 text-sm text-neutral-600">Carregando vendas…</p>}

      {!erroTela && !carregando && lojas && (
        <div className="space-y-4">
          <IndicadoresVendas atual={totais} anterior={totaisAnt} rotuloComparacao={anterior.rotulo} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <GraficoVendas linhas={linhas} de={periodo.de} ate={periodo.ate} lojas={lojasEscolhidas} canais={canaisSel} />
            </div>
            <ParticipacaoCanais porCanal={porCanal} />
          </div>
          <TabelaLojas linhas={linhas} lojas={lojasEscolhidas} />
        </div>
      )}

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-neutral-700">Atualização das vendas e conexão com o Xmenu</summary>
        <div className="mt-4 max-w-3xl space-y-4">
          <SincronizacaoVendas />
          <ConexaoXmenu />
        </div>
      </details>
    </div>
  );
}
