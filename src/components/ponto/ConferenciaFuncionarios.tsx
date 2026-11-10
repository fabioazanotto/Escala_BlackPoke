"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Item, ResultadoConferencia } from "@/lib/ponto/conferencia";
import type { ResumoHorario } from "@/lib/ponto/horarios";

type Resposta = {
  conferencia: ResultadoConferencia;
  horarios: { usados: ResumoHorario[]; naoUsados: number; funcionariosComHorarioAlternativo: number };
  verificadoEm: string;
};

const dataBR = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function Resumo({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <p className="text-xs text-neutral-600">{rotulo}</p>
      <p className={`text-xl font-semibold tabular-nums ${alerta && valor > 0 ? "text-amber-800" : ""}`}>{valor}</p>
    </div>
  );
}

type Acao = { rotulo: string; aoClicar: (i: Item) => void; ocupado: string | null; pode: (i: Item) => boolean };

const chaveDoItem = (i: Item) => `${i.blackpoke?.id ?? ""}|${i.secullum?.id ?? ""}`;

function Lista({ titulo, itens, aberta, acao }: { titulo: string; itens: Item[]; aberta?: boolean; acao?: Acao }) {
  return (
    <details className="rounded-xl border border-neutral-200" open={aberta && itens.length > 0}>
      <summary className="cursor-pointer px-3 py-2.5 font-medium">
        {titulo} <span className="font-normal text-neutral-500">({itens.length})</span>
      </summary>
      {itens.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-neutral-600">Nenhum caso.</p>
      ) : (
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Secullum</th>
                <th className="py-1 pr-3 font-medium">BlackPoke</th>
                <th className="py-1 font-medium">Observação</th>
                {acao && <th className="py-1 pl-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {itens.map((i, k) => (
                <tr key={k} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-3">
                    {i.secullum ? (
                      <>
                        <p className="font-medium">{i.secullum.nome}</p>
                        <p className="text-xs text-neutral-600">
                          CPF {i.secullum.cpfMascarado} · {i.secullum.empresa}
                          {!i.secullum.ativo && ` · desligado em ${dataBR(i.secullum.demissao)}`}
                        </p>
                        <p className="text-xs text-neutral-500">{[i.secullum.funcao, i.secullum.departamento].filter(Boolean).join(" · ")}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {i.blackpoke ? (
                      <>
                        <p className="font-medium">{i.blackpoke.nome}</p>
                        <p className="text-xs text-neutral-600">
                          {i.blackpoke.cpfMascarado ? `CPF ${i.blackpoke.cpfMascarado}` : "sem CPF"} · {i.blackpoke.unidade}
                          {!i.blackpoke.ativo && " · inativo"}
                        </p>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-neutral-700">
                    {i.confianca && <p className="text-xs text-neutral-500">ligado por {i.confianca === "vinculo" ? "vínculo confirmado" : i.confianca === "cpf" ? "CPF" : "nome"}</p>}
                    {i.motivos.length === 0 ? <span className="text-green-800">Sem divergências</span> : i.motivos.map((m) => <p key={m}>{m}</p>)}
                  </td>
                  {acao && (
                    <td className="py-2 pl-3">
                      {acao.pode(i) && (
                        <button className="botao-secundario whitespace-nowrap !px-3 !py-2" disabled={acao.ocupado !== null} onClick={() => acao.aoClicar(i)}>
                          {acao.ocupado === chaveDoItem(i) ? "Gravando…" : acao.rotulo}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

export function ConferenciaFuncionarios() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function chamarVinculo(caminho: string, i: Item) {
    if (!i.blackpoke || !i.secullum) return;
    const desfazendo = caminho.endsWith("/desfazer");
    const pergunta = desfazendo
      ? `Desfazer o vínculo entre "${i.blackpoke.nome}" (BlackPoke) e "${i.secullum.nome}" (Secullum)?`
      : `Confirmar que "${i.blackpoke.nome}" (BlackPoke) é a mesma pessoa que "${i.secullum.nome}" (Secullum, ${i.secullum.empresa})?`;
    if (!window.confirm(pergunta)) return;
    setOcupado(chaveDoItem(i));
    setErro(null);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre de novo.");
      const r = await fetch(caminho, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ colaboradorId: i.blackpoke.id, funcionarioId: i.secullum.id }),
        cache: "no-store",
      });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
        throw new Error(corpo.erro ?? `Falha ${r.status}`);
      }
      await conferir(); // recarrega: o par confirmado passa para "nos dois sistemas"
    } catch (e) {
      setErro((e as Error).message);
    }
    setOcupado(null);
  }

  async function conferir() {
    setCarregando(true);
    setCopiado(null);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre de novo.");
      const r = await fetch("/api/secullum/conferencia", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
        throw new Error(r.status === 504 ? "O servidor demorou demais (504). Tente de novo." : (corpo.erro ?? `Falha ${r.status}`));
      }
      setResposta((await r.json()) as Resposta);
      setErro(null);
    } catch (e) {
      setResposta(null);
      setErro((e as Error).message);
    }
    setCarregando(false);
  }

  async function copiar(qual: "contagens" | "horarios") {
    if (!resposta) return;
    // Só números e descrições de horário: nenhum nome nem CPF vai para a área de transferência.
    const conteudo = qual === "contagens" ? resposta.conferencia.resumo : resposta.horarios;
    try {
      await navigator.clipboard.writeText(JSON.stringify(conteudo, null, 2));
      setCopiado(qual);
    } catch {
      setErro("Não consegui copiar. Selecione o texto e copie à mão.");
    }
  }

  const c = resposta?.conferencia;

  return (
    <section className="cartao max-w-5xl space-y-3">
      <h2 className="text-lg font-semibold">Conferir funcionários</h2>
      <p className="text-neutral-700">
        Compara os funcionários do Secullum (só das empresas incluídas no projeto) com os colaboradores do BlackPoke. <strong>Não grava nada</strong>: só aponta o que existe nos dois lados, o que existe em um só e o que diverge.
        Esta tela mostra nomes; o CPF aparece mascarado. Só administradores a enxergam.
      </p>
      <button className="botao" onClick={conferir} disabled={carregando}>
        {carregando ? "Conferindo…" : "Conferir funcionários"}
      </button>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

      {c && resposta && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Resumo rotulo="Ativos no Secullum" valor={c.resumo.secullumAtivos} />
            <Resumo rotulo="Ativos no BlackPoke" valor={c.resumo.blackpokeAtivos} />
            <Resumo rotulo="Nos dois sistemas" valor={c.resumo.nosDois} />
            <Resumo rotulo="Com divergência" valor={c.resumo.comDivergencia} alerta />
            <Resumo rotulo="Só no Secullum" valor={c.resumo.soSecullum} alerta />
            <Resumo rotulo="Só no BlackPoke" valor={c.resumo.soBlackpoke} alerta />
            <Resumo rotulo="Casos duvidosos" valor={c.resumo.duvidosos} alerta />
            <Resumo rotulo="Duplicidades" valor={c.resumo.duplicidades} alerta />
          </div>
          <p className="text-sm text-neutral-600">
            Desligados no Secullum (das empresas incluídas): {c.resumo.secullumDesligados}. Inativos no BlackPoke: {c.resumo.blackpokeInativos}. Colaboradores ativos do BlackPoke sem CPF: {c.resumo.blackpokeSemCpf}. Ativos no Secullum com vínculo anterior já desligado (recontratados): {c.resumo.recontratados}.
          </p>

          <div className="space-y-2">
            <Lista titulo="Casos duvidosos (confirmar se é a mesma pessoa)" itens={c.duvidosos} aberta acao={{ rotulo: "É a mesma pessoa", ocupado, pode: (i) => !!i.blackpoke && !!i.secullum, aoClicar: (i) => chamarVinculo("/api/secullum/vinculos", i) }} />
            <Lista titulo="Duplicidades no Secullum" itens={c.duplicidades} aberta />
            <Lista titulo="Só no Secullum (ativos)" itens={c.soSecullum} aberta />
            <Lista titulo="Só no BlackPoke (ativos)" itens={c.soBlackpoke} aberta />
            <Lista titulo="Nos dois sistemas" itens={c.nosDois} acao={{ rotulo: "Desfazer vínculo", ocupado, pode: (i) => i.confianca === "vinculo", aoClicar: (i) => chamarVinculo("/api/secullum/vinculos/desfazer", i) }} />
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Como os horários estão montados no Secullum</h3>
            <p className="text-sm text-neutral-600">
              {resposta.horarios.usados.length} horário(s) em uso por funcionários ativos ({resposta.horarios.naoUsados} cadastrado(s) sem uso).{" "}
              {resposta.horarios.funcionariosComHorarioAlternativo} funcionário(s) ativo(s) têm horário alternativo.
            </p>
            {resposta.horarios.usados.map((h) => (
              <details key={h.id ?? h.descricao} className="rounded-xl border border-neutral-200">
                <summary className="cursor-pointer px-3 py-2.5">
                  <span className="font-medium">{h.descricao || `Horário ${h.numero}`}</span>{" "}
                  <span className="text-sm text-neutral-500">
                    · {h.usoAtivos} ativo(s){h.ciclos > 0 ? ` · ciclos: ${h.ciclos}` : ""}
                    {h.temDataBase ? " · com data base" : ""}
                  </span>
                </summary>
                <ul className="px-3 pb-3 text-sm">
                  {h.dias.map((d) => (
                    <li key={d.dia} className="flex gap-3 border-t border-neutral-100 py-1">
                      <span className="w-9 font-medium">{d.dia}</span>
                      <span className="tabular-nums">{d.texto}</span>
                      <span className="text-neutral-500">{d.tipoDia}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="botao-secundario" onClick={() => copiar("contagens")}>
              {copiado === "contagens" ? "Copiado" : "Copiar só as contagens"}
            </button>
            <button className="botao-secundario" onClick={() => copiar("horarios")}>
              {copiado === "horarios" ? "Copiado" : "Copiar resumo dos horários"}
            </button>
          </div>
          <p className="text-xs text-neutral-500">Os dois botões de cópia levam só números e descrições de horário, sem nomes nem CPFs. Verificado em {new Date(resposta.verificadoEm).toLocaleString("pt-BR")}.</p>
        </div>
      )}
    </section>
  );
}
