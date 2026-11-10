"use client";

import { useState } from "react";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { Icone } from "@/components/Icones";
import { ConferenciaFuncionarios } from "@/components/ponto/ConferenciaFuncionarios";
import { useSessao } from "@/components/Sessao";
import { ehAdmin } from "@/lib/acesso";
import { supabase } from "@/lib/supabase";

type Etapa = { nome: string; ok: boolean; tempoMs: number; mensagem: string; detalhes?: Record<string, unknown> };
type Resposta = {
  etapas: Etapa[];
  bancos: { id: number | string; identificador: string; nome: string }[];
  bancoUsado: string | null;
  empresas: { id: number | null; nome: string; documento: string; funcionariosAtivos: number; funcionariosDesligados: number }[];
  funcionariosSemEmpresaVisivel?: number;
  verificadoEm: string;
};

export default function Ponto() {
  const { perfil } = useSessao();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function testar() {
    setCarregando(true);
    setErro(null);
    setCopiado(false);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre de novo.");
      const r = await fetch("/api/secullum/diagnostico", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
        throw new Error(r.status === 504 ? "O servidor demorou demais (504). Tente de novo." : (corpo.erro ?? `Falha ${r.status}`));
      }
      setResposta((await r.json()) as Resposta);
    } catch (e) {
      setResposta(null);
      setErro((e as Error).message);
    }
    setCarregando(false);
  }

  async function copiar() {
    if (!resposta) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(resposta, null, 2));
      setCopiado(true);
    } catch {
      setErro("Não consegui copiar. Selecione o texto em 'Ver detalhes técnicos' e copie à mão.");
    }
  }

  return (
    <div>
      <CabecalhoPagina titulo="Ponto" descricao="Marcações do Secullum Ponto Web, comparadas com a escala. Em construção." />

      {!ehAdmin(perfil) ? (
        <section className="cartao max-w-3xl">
          <p className="text-neutral-700">A integração com o Secullum está em preparação e, por enquanto, só administradores têm acesso.</p>
        </section>
      ) : (
        <div className="space-y-4">
        <ConferenciaFuncionarios />
        <section className="cartao max-w-3xl space-y-3">
          <h2 className="text-lg font-semibold">Conexão com o Secullum</h2>
          <p className="text-neutral-700">
            Confere o login da conta de integração e a leitura de cada cadastro. O teste só lê (nunca grava) e mostra estrutura e contagens: não mostra nomes de funcionários, CPF nem horários de batidas.
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="botao" onClick={testar} disabled={carregando}>
              {carregando ? "Testando…" : "Testar conexão"}
            </button>
            {resposta && (
              <button className="botao-secundario" onClick={copiar}>
                {copiado ? "Copiado" : "Copiar resultado"}
              </button>
            )}
          </div>
          {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

          {resposta && (
            <div className="space-y-4">
              <ul className="space-y-2">
                {resposta.etapas.map((e) => (
                  <li key={e.nome} className="rounded-xl border border-neutral-200 p-3">
                    <p className="flex items-center gap-2 font-medium">
                      <Icone nome={e.ok ? "ok" : "alerta"} tamanho={18} className={e.ok ? "text-green-700" : "text-red-700"} />
                      {e.nome}
                      <span className="text-sm font-normal text-neutral-500">{e.tempoMs} ms</span>
                    </p>
                    <p className={`mt-1 text-sm ${e.ok ? "text-neutral-700" : "text-red-700"}`}>{e.mensagem}</p>
                  </li>
                ))}
              </ul>

              {resposta.empresas.length > 0 && (
                <div>
                  <h3 className="mb-1 font-semibold">Empresas que esta conta enxerga</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="text-left text-xs text-neutral-500">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Empresa</th>
                          <th className="py-1 pr-3 font-medium">CNPJ</th>
                          <th className="py-1 pr-3 text-right font-medium">Ativos</th>
                          <th className="py-1 text-right font-medium">Desligados</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resposta.empresas.map((e) => (
                          <tr key={e.documento} className="border-t border-neutral-100">
                            <td className="py-1.5 pr-3">{e.nome}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{e.documento}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{e.funcionariosAtivos}</td>
                            <td className="py-1.5 text-right tabular-nums">{e.funcionariosDesligados}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!!resposta.funcionariosSemEmpresaVisivel && (
                    <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                      {resposta.funcionariosSemEmpresaVisivel} funcionário(s) pertencem a empresas que não estão nesta lista. O app descarta esses dados antes de gravar.
                    </p>
                  )}
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-sm font-medium text-neutral-700">Ver detalhes técnicos (campos devolvidos)</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-neutral-50 p-3 text-xs">{JSON.stringify(resposta, null, 2)}</pre>
              </details>
              <p className="text-sm text-neutral-500">Verificado em {new Date(resposta.verificadoEm).toLocaleString("pt-BR")}.</p>
            </div>
          )}
        </section>
        </div>
      )}
    </div>
  );
}
