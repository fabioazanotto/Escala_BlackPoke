"use client";

import { useEffect, useState } from "react";
import { identidade } from "@/config/identidade";
import { chamar } from "@/components/ponto/chamar";
import { justificativasDeAlteracao, linhasDoCartao, totaisDoCartao, type CabecalhoCartao } from "@/lib/ponto/cartao";
import type { MesDoColaborador } from "@/lib/ponto/mesTipos";

type Resposta = { mes: MesDoColaborador; cabecalho: CabecalhoCartao };

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

// Impressão: só o cartão, em A4 paisagem (o resto da tela some).
const CSS_IMPRESSAO = `
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  body * { visibility: hidden !important; }
  .cartao-ponto, .cartao-ponto * { visibility: visible !important; }
  .cartao-ponto { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
  .cartao-ponto .faixa { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cartao-ponto tr, .cartao-ponto .sem-quebra { break-inside: avoid; }
}`;

function Campo({ rotulo, valor, className = "" }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[9px] uppercase text-neutral-600">{rotulo}</p>
      <p className="min-h-[14px] text-[11px]">{valor || " "}</p>
    </div>
  );
}

export function CartaoPonto({ funcionarioId, mes, nome }: { funcionarioId: number; mes: string; nome: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const t = setTimeout(() => {
      setDados(null);
      setErro(null);
      chamar<Resposta>(`/api/ponto/cartao?funcionario=${funcionarioId}&mes=${mes}`)
        .then((r) => ativo && setDados(r))
        .catch((e) => ativo && setErro((e as Error).message));
    }, 0);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [funcionarioId, mes]);

  if (erro) return <p className="nao-imprimir rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>;
  if (!dados) return <p className="text-sm text-neutral-600">Montando o cartão ponto de {nome}…</p>;

  const { mes: m, cabecalho: c } = dados;
  const linhas = linhasDoCartao(m);
  const totais = totaisDoCartao(m);
  const alteracoes = justificativasDeAlteracao(m);
  const emitido = new Date().toLocaleString("pt-BR");

  return (
    <div className="space-y-3">
      <style>{CSS_IMPRESSAO}</style>
      <div className="nao-imprimir flex flex-wrap items-center gap-3">
        <p className="text-sm text-neutral-700">Cópia para conferência, no formato do cartão do Secullum. Não substitui o documento assinado.</p>
        <button type="button" className="botao ml-auto" onClick={() => window.print()}>
          Imprimir / salvar em PDF
        </button>
      </div>
      {m.avisoOficial && <p className="nao-imprimir rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Não consegui o cálculo oficial do Secullum agora ({m.avisoOficial}). As colunas de horas ficam em branco.</p>}

      <article className="cartao-ponto overflow-x-auto rounded-xl border border-neutral-300 bg-white p-4 font-mono text-neutral-900">
        <div className="min-w-[860px]">
          <div className="flex items-start justify-between gap-4">
            <p className="text-lg font-bold">{identidade.nome}</p>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight">CARTÃO PONTO</p>
              <p className="text-[11px]">Período: {dataBR(`${m.mes}-01`)} até {dataBR(ultimoDia(m.mes))}.</p>
              <p className="text-[11px]">{identidade.nome} | dados do Secullum Ponto Web</p>
            </div>
          </div>

          <div className="sem-quebra mt-2 grid grid-cols-[1fr_auto] gap-6">
            <div className="divide-y divide-neutral-400 border-y border-neutral-400">
              <Campo rotulo="Empresa" valor={c.empresaNome} />
              <div className="grid grid-cols-4 gap-2">
                <Campo rotulo="CNPJ" valor={c.cnpj} />
                <Campo rotulo="Inscrição" valor={c.inscricao} />
                <Campo rotulo="Departamento" valor={c.departamento} />
                <Campo rotulo="Função" valor={c.funcao} />
              </div>
              <Campo rotulo="Nome" valor={c.nome} />
              <div className="grid grid-cols-4 gap-2">
                <Campo rotulo="Admissão" valor={c.admissao ? dataBR(c.admissao) : ""} />
                <Campo rotulo="CPF" valor={c.cpf} />
                <Campo rotulo="C.T.P.S." valor={c.ctps} />
                <Campo rotulo="Nº Folha" valor={c.numeroFolha} />
              </div>
            </div>
            <div className="min-w-[250px]">
              <p className="border-b-2 border-amber-400 text-[10px] font-semibold text-amber-600">HORÁRIO DE TRABALHO</p>
              {c.horarioTrabalho ? (
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-left text-neutral-600">
                      {["DIA", "ENT.1", "SAÍ.1", "ENT.2", "SAÍ.2", "ENT.3", "SAÍ.3"].map((h) => (
                        <th key={h} className="pr-1 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.horarioTrabalho.map((h) => (
                      <tr key={h.dia}>
                        <td className="pr-1">{h.dia}</td>
                        {h.horas.map((x, i) => (
                          <td key={i} className="pr-1 tabular-nums">
                            {x}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-1 text-[10px] text-neutral-600">Horário em rodízio ou não encontrado.</p>
              )}
            </div>
          </div>

          <table className="mt-2 w-full border-collapse text-[10px] tabular-nums">
            <thead>
              <tr className="faixa bg-neutral-700 text-left text-white">
                {["DATA", "ENTRADA 1", "SAÍDA 1", "ENTRADA 2", "SAÍDA 2", "NORMAIS", "FALTAS", "EXTRAS", "DSR", "CARGA", "NOT.TOT."].map((h) => (
                  <th key={h} className="px-1 py-0.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.dia} className={i % 2 === 1 ? "faixa bg-neutral-100" : ""}>
                  <td className="whitespace-nowrap px-1 py-px">{l.rotulo}</td>
                  {l.celulas.map((x, k) => (
                    <td key={k} className="px-1 py-px">
                      {x}
                    </td>
                  ))}
                  <td className="px-1 py-px">{l.normais}</td>
                  <td className="px-1 py-px">{l.faltas}</td>
                  <td className="px-1 py-px">{l.extras}</td>
                  <td className="px-1 py-px">{l.dsr}</td>
                  <td className="px-1 py-px">{l.carga}</td>
                  <td className="px-1 py-px">{l.notTot}</td>
                </tr>
              ))}
              {totais && (
                <tr className="border-t border-neutral-500 font-semibold">
                  <td className="px-1 py-0.5">TOTAIS</td>
                  <td colSpan={4} />
                  <td className="px-1">{totais.normais}</td>
                  <td className="px-1">{totais.faltas}</td>
                  <td className="px-1">{totais.extras}</td>
                  <td className="px-1">{totais.dsr}</td>
                  <td className="px-1">{totais.carga}</td>
                  <td className="px-1">{totais.notTot}</td>
                </tr>
              )}
            </tbody>
          </table>

          {alteracoes.length > 0 && (
            <div className="mt-2">
              <p className="faixa bg-neutral-700 px-1 py-0.5 text-[10px] text-white">JUSTIFICATIVAS DE ALTERAÇÃO</p>
              <table className="w-full text-[10px] tabular-nums">
                <thead>
                  <tr className="text-left text-neutral-600">
                    <th className="w-28 px-1 font-normal">DATA</th>
                    <th className="px-1 font-normal">HORA - OCORRÊNCIA</th>
                  </tr>
                </thead>
                <tbody>
                  {alteracoes.map((a) =>
                    a.linhas.map((l, i) => (
                      <tr key={a.dia + l + i}>
                        <td className="px-1 py-px">{i === 0 ? dataBR(a.dia) : ""}</td>
                        <td className="px-1 py-px">{l}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 font-sans text-[9px]">(*) - Batida lançada manualmente · I - batida incluída · D - batida desconsiderada</p>

          <div className="sem-quebra mt-10 grid grid-cols-2 gap-16 text-center font-sans text-[10px]">
            <div>
              <div className="border-t border-neutral-700 pt-1">{c.nome}</div>
            </div>
            <div>
              <div className="border-t border-neutral-700 pt-1">
                {c.empresaNome}
                <br />
                {c.responsavelCargo || "Responsável"}
              </div>
            </div>
          </div>

          <p className="mt-4 flex justify-between font-sans text-[9px] text-neutral-600">
            <span>Gerado pelo {identidade.nome} com dados do Secullum Ponto Web (somente leitura)</span>
            <span>Emitido em {emitido}</span>
          </p>
        </div>
      </article>
    </div>
  );
}
