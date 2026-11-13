"use client";

import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { useSessao } from "@/components/Sessao";

const PLANEJADO = [
  "Documentos e processos de cada cargo",
  "Kit de boas-vindas gerado com o nome do novo colaborador",
  "Regras da empresa e descrição do cargo",
];

export default function IntegracaoColaboradores() {
  const { creator } = useSessao();

  if (!creator) {
    return (
      <div>
        <CabecalhoPagina titulo="Integração colaboradores" />
        <section className="cartao max-w-xl space-y-2">
          <p className="text-lg font-semibold">Em breve</p>
          <p className="text-neutral-700">Estamos preparando esta área. Quando ela estiver pronta, você será avisado.</p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <CabecalhoPagina titulo="Integração colaboradores" descricao="Área do creator. Os demais usuários veem apenas “Em breve”." />
      <section className="cartao max-w-xl space-y-3">
        <p className="text-lg font-semibold">Em construção</p>
        <p className="text-neutral-700">Esta área vai reunir, por cargo:</p>
        <ul className="list-disc space-y-1 pl-5 text-neutral-800">
          {PLANEJADO.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="text-sm text-neutral-600">Os cargos e documentos entram aqui quando o conteúdo for definido.</p>
      </section>
    </div>
  );
}
