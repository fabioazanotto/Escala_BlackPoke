"use client";

import { useCallback, useEffect, useState } from "react";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { useSessao } from "@/components/Sessao";
import { ehAdmin, ROTULO_PERFIL } from "@/lib/acesso";
import { supabase } from "@/lib/supabase";
import { gerarSenha, PERFIS, type PerfilUsuario } from "@/lib/usuarios";
import type { UsuarioDaLista } from "@/lib/servidor/usuarios";

type Unidade = { id: string; nome: string };
type Formulario = { id: string | null; nome: string; email: string; perfil: PerfilUsuario; senha: string; unidadeIds: string[] };

const VAZIO: Formulario = { id: null, nome: "", email: "", perfil: "gerencia", senha: "", unidadeIds: [] };

async function chamar<T>(init?: { corpo: object }): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch("/api/usuarios", {
    method: init ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init ? { "Content-Type": "application/json" } : {}) },
    body: init ? JSON.stringify(init.corpo) : undefined,
    cache: "no-store",
  });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(json.erro ?? `Falha ${r.status}`);
  return json;
}

function CampoSenha({ valor, aoMudar }: { valor: string; aoMudar: (s: string) => void }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="campo" type={ver ? "text" : "password"} autoComplete="new-password" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder="Mínimo de 8 caracteres, com letras e números" />
        <button type="button" className="botao-secundario whitespace-nowrap" onClick={() => { aoMudar(gerarSenha()); setVer(true); }}>
          Gerar
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" className="h-5 w-5" checked={ver} onChange={(e) => setVer(e.target.checked)} /> mostrar a senha
      </label>
    </div>
  );
}

export default function Usuarios() {
  const { perfil } = useSessao();
  const [usuarios, setUsuarios] = useState<UsuarioDaLista[] | null>(null);
  const [eu, setEu] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [senhaDe, setSenhaDe] = useState<{ id: string; nome: string; senha: string } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; senha?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await chamar<{ usuarios: UsuarioDaLista[]; eu: string }>();
      setUsuarios(r.usuarios);
      setEu(r.eu);
      const { data } = await supabase().from("unidades").select("id, nome").eq("ativa", true).order("nome");
      setUnidades((data as Unidade[] | null) ?? []);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!ehAdmin(perfil)) return;
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [perfil, carregar]);

  async function executar(corpo: object, depois: () => void, mensagem: string, senha?: string) {
    setOcupado(true);
    setErro(null);
    setCopiado(false);
    try {
      await chamar({ corpo });
      depois();
      setAviso({ texto: mensagem, senha });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
    setOcupado(false);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.id) {
      void executar({ acao: "alterar", id: form.id, nome: form.nome, perfil: form.perfil, unidadeIds: form.perfil === "gerencia" ? form.unidadeIds : [] }, () => setForm(null), "Usuário atualizado.");
    } else {
      void executar({ acao: "criar", nome: form.nome, email: form.email, perfil: form.perfil, senha: form.senha, unidadeIds: form.perfil === "gerencia" ? form.unidadeIds : [] }, () => setForm(null), `Usuário criado: ${form.email.trim().toLowerCase()}.`, form.senha);
    }
  }

  function redefinir(e: React.FormEvent) {
    e.preventDefault();
    if (!senhaDe) return;
    void executar({ acao: "senha", id: senhaDe.id, senha: senhaDe.senha }, () => setSenhaDe(null), `Senha de ${senhaDe.nome} redefinida.`, senhaDe.senha);
  }

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      setCopiado(true);
    } catch {
      setErro("Não consegui copiar. Selecione a senha e copie à mão.");
    }
  }

  if (!ehAdmin(perfil)) {
    return (
      <div>
        <CabecalhoPagina titulo="Usuários" />
        <section className="cartao max-w-xl">
          <p className="text-neutral-700">Só administradores podem ver e cadastrar usuários.</p>
        </section>
      </div>
    );
  }

  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "?";

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Usuários" descricao="Quem pode entrar no sistema. Aqui você cria usuários, define o perfil e redefine senhas.">
        <button className="botao" onClick={() => { setForm({ ...VAZIO }); setSenhaDe(null); setAviso(null); }}>
          Novo usuário
        </button>
      </CabecalhoPagina>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

      {aviso && (
        <section className="cartao space-y-2 border-green-300 bg-green-50">
          <p className="font-medium text-green-900">{aviso.texto}</p>
          {aviso.senha && (
            <>
              <p className="text-sm text-neutral-800">Senha temporária (anote agora: ela não aparece de novo):</p>
              <p className="flex flex-wrap items-center gap-3">
                <code className="rounded-lg bg-white px-3 py-2 text-lg font-semibold tracking-wider">{aviso.senha}</code>
                <button className="botao-secundario" onClick={() => void copiar(aviso.senha!)}>
                  {copiado ? "Copiada" : "Copiar"}
                </button>
              </p>
              <p className="text-sm text-neutral-700">Passe para a pessoa por mensagem direta. No primeiro acesso, o sistema obriga a trocar por uma senha só dela.</p>
            </>
          )}
        </section>
      )}

      {form && (
        <form onSubmit={salvar} className="cartao max-w-xl space-y-3">
          <h2 className="text-lg font-semibold">{form.id ? "Editar usuário" : "Novo usuário"}</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input className="campo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </label>
          {!form.id && (
            <label className="block">
              <span className="mb-1 block font-medium">E-mail (é o login)</span>
              <input className="campo" type="email" inputMode="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block font-medium">Perfil</span>
            <select className="campo" value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as PerfilUsuario })}>
              {PERFIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PERFIL[p]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-sm text-neutral-600">Admin: tudo, inclusive Vendas, Ponto e Usuários. RH: escalas, colaboradores e regras de todas as unidades. Gerência: só as unidades marcadas abaixo.</span>
          </label>
          {form.perfil === "gerencia" && (
            <fieldset className="space-y-1">
              <legend className="mb-1 font-medium">Unidades que pode ver</legend>
              {unidades.map((u) => (
                <label key={u.id} className="flex items-center gap-2">
                  <input type="checkbox" className="h-5 w-5" checked={form.unidadeIds.includes(u.id)} onChange={(e) => setForm({ ...form, unidadeIds: e.target.checked ? [...form.unidadeIds, u.id] : form.unidadeIds.filter((x) => x !== u.id) })} />
                  {u.nome}
                </label>
              ))}
              {form.unidadeIds.length === 0 && <p className="text-sm text-amber-800">Sem nenhuma unidade marcada, a gerência não enxerga nada.</p>}
            </fieldset>
          )}
          {!form.id && (
            <div>
              <span className="mb-1 block font-medium">Senha temporária</span>
              <CampoSenha valor={form.senha} aoMudar={(senha) => setForm({ ...form, senha })} />
            </div>
          )}
          <div className="flex gap-2">
            <button className="botao flex-1" type="submit" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Salvar"}
            </button>
            <button className="botao-secundario flex-1" type="button" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {senhaDe && (
        <form onSubmit={redefinir} className="cartao max-w-xl space-y-3">
          <h2 className="text-lg font-semibold">Redefinir a senha de {senhaDe.nome}</h2>
          <p className="text-sm text-neutral-700">Defina uma senha temporária. No próximo acesso, a pessoa será obrigada a trocá-la.</p>
          <CampoSenha valor={senhaDe.senha} aoMudar={(senha) => setSenhaDe({ ...senhaDe, senha })} />
          <div className="flex gap-2">
            <button className="botao flex-1" type="submit" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Redefinir senha"}
            </button>
            <button className="botao-secundario flex-1" type="button" onClick={() => setSenhaDe(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!usuarios && !erro && <p className="text-neutral-600">Carregando…</p>}
      <ul className="space-y-3">
        {usuarios?.map((u) => (
          <li key={u.id} className={`cartao ${u.ativo ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-semibold">
                  {u.nome} {u.id === eu && <span className="text-sm font-normal text-neutral-500">(você)</span>}
                </p>
                <p className="break-all text-neutral-700">{u.email}</p>
                <p className="text-sm text-neutral-600">
                  {u.perfil === "gerencia" ? (u.unidadeIds.length > 0 ? `Unidades: ${u.unidadeIds.map(nomeUnidade).join(", ")}` : "Nenhuma unidade liberada") : u.perfil === "rh" ? "Todas as unidades" : "Acesso total"}
                  {" · "}
                  {u.ultimoAcesso ? `último acesso ${new Date(u.ultimoAcesso).toLocaleString("pt-BR")}` : "nunca entrou"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm">{ROTULO_PERFIL[u.perfil]}</span>
                {!u.ativo && <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm">Inativo</span>}
                {u.precisaTrocarSenha && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">Vai trocar a senha</span>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="botao-secundario flex-1" onClick={() => { setForm({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, senha: "", unidadeIds: u.unidadeIds }); setSenhaDe(null); setAviso(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                Editar
              </button>
              <button className="botao-secundario flex-1" onClick={() => { setSenhaDe({ id: u.id, nome: u.nome, senha: "" }); setForm(null); setAviso(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                Redefinir senha
              </button>
              {u.id !== eu && (
                <button
                  className="botao-secundario flex-1"
                  disabled={ocupado}
                  onClick={() => {
                    if (u.ativo && !window.confirm(`Inativar ${u.nome}? A pessoa deixa de conseguir entrar.`)) return;
                    void executar({ acao: "alterar", id: u.id, ativo: !u.ativo }, () => undefined, u.ativo ? `${u.nome} foi inativado.` : `${u.nome} foi reativado.`);
                  }}
                >
                  {u.ativo ? "Inativar" : "Reativar"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
