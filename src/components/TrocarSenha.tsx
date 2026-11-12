"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { validarSenha } from "@/lib/usuarios";

function traduzir(mensagem: string): string {
  if (/different from the old/i.test(mensagem)) return "A nova senha precisa ser diferente da atual.";
  if (/weak|pwned|compromised/i.test(mensagem)) return "Essa senha é fraca ou muito comum. Escolha outra.";
  return "Não consegui trocar a senha. Tente de novo.";
}

/** Troca a própria senha. Quando `obrigatorio`, é a tela que aparece no primeiro acesso (senha temporária definida pelo admin). */
export function TrocarSenha({ obrigatorio, aoSair }: { obrigatorio?: boolean; aoSair?: () => void }) {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const invalida = validarSenha(senha);
    if (invalida) return setErro(invalida);
    if (senha !== confirma) return setErro("As duas senhas não são iguais.");
    setSalvando(true);
    const { error } = await supabase().auth.updateUser({ password: senha, data: { trocar_senha: false } });
    setSalvando(false);
    if (error) return setErro(traduzir(error.message));
    setSenha("");
    setConfirma("");
    setOk(true);
  }

  return (
    <form onSubmit={enviar} className="cartao max-w-sm space-y-3">
      <h2 className="text-lg font-semibold">{obrigatorio ? "Defina a sua senha" : "Alterar minha senha"}</h2>
      {obrigatorio && <p className="text-neutral-700">Você entrou com uma senha temporária. Escolha agora uma senha só sua para continuar.</p>}
      <label className="block">
        <span className="mb-1 block font-medium">Nova senha</span>
        <input className="campo" type={ver ? "text" : "password"} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Repita a nova senha</span>
        <input className="campo" type={ver ? "text" : "password"} autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" className="h-5 w-5" checked={ver} onChange={(e) => setVer(e.target.checked)} /> mostrar a senha
      </label>
      <p className="text-sm text-neutral-600">Pelo menos 10 caracteres, com letras e números.</p>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {ok && <p className="rounded-xl bg-green-50 p-3 text-green-900">Senha alterada. Use a nova senha no próximo acesso.</p>}
      <button className="botao w-full" type="submit" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar senha"}
      </button>
      {aoSair && (
        <button type="button" className="botao-secundario w-full" onClick={aoSair}>
          Sair
        </button>
      )}
    </form>
  );
}
