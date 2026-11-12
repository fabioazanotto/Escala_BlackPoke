// Navegação principal (sidebar). Cada tela nova entra aqui.

import type { PerfilAcesso } from "@/lib/tipos";

export type NomeIcone =
  | "vendas"
  | "rh"
  | "configuracoes"
  | "painel"
  | "escala"
  | "colaboradores"
  | "ausencias"
  | "cobertura";

export type SubItem = { rotulo: string; href: string; exato?: boolean }; // exato: só fica marcado nesse caminho (não nos filhos)

export type Destino = {
  rotulo: string;
  href: string;
  icone: NomeIcone;
  rotas: string[]; // rotas que mantêm este destino marcado como ativo
  perfis: PerfilAcesso[]; // quem enxerga e pode abrir este destino
  subitens?: SubItem[]; // aparecem recuados embaixo do destino, na barra lateral
};

export const destinos: Destino[] = [
  { rotulo: "Vendas", href: "/vendas", icone: "vendas", rotas: ["/vendas"], perfis: ["admin"] },
  {
    rotulo: "RH",
    href: "/rh",
    icone: "rh",
    rotas: ["/rh", "/escala-mensal", "/colaboradores", "/ausencias", "/cobertura", "/ponto", "/ponto-integracao"],
    perfis: ["rh", "gerencia", "admin"],
    subitens: [
      { rotulo: "Visão geral", href: "/rh" },
      { rotulo: "Escala do mês", href: "/escala-mensal" },
      { rotulo: "Colaboradores", href: "/colaboradores" },
      { rotulo: "Ausências", href: "/ausencias" },
      { rotulo: "Cobertura", href: "/cobertura" },
      { rotulo: "Ponto ao vivo", href: "/ponto", exato: true },
      { rotulo: "Ponto por colaborador", href: "/ponto/colaborador" },
      { rotulo: "Integração do ponto", href: "/ponto-integracao" },
    ],
  },
  {
    rotulo: "Configurações",
    href: "/unidades",
    icone: "configuracoes",
    rotas: ["/unidades", "/funcoes", "/horarios", "/regras", "/regras-da-unidade", "/usuarios"],
    perfis: ["rh", "gerencia", "admin"],
  },
];

// Abas dentro de Configurações.
export const abasConfiguracoes: { rotulo: string; href: string; somenteAdmin?: boolean }[] = [
  { rotulo: "Unidades", href: "/unidades" },
  { rotulo: "Funções", href: "/funcoes" },
  { rotulo: "Horários", href: "/horarios" },
  { rotulo: "Regras e feriados", href: "/regras" },
  { rotulo: "Regras da unidade", href: "/regras-da-unidade" },
  { rotulo: "Usuários", href: "/usuarios", somenteAdmin: true },
];

// Caminho mostrado na barra superior.
export const trilhas: Record<string, string[]> = {
  "/vendas": ["Vendas"],
  "/rh": ["RH", "Visão geral"],
  "/escala-mensal": ["RH", "Escala do mês"],
  "/colaboradores": ["RH", "Colaboradores"],
  "/colaboradores/importar": ["RH", "Colaboradores", "Importar planilha"],
  "/ausencias": ["RH", "Ausências"],
  "/cobertura": ["RH", "Cobertura"],
  "/ponto": ["RH", "Ponto ao vivo"],
  "/ponto/colaborador": ["RH", "Ponto por colaborador"],
  "/ponto-integracao": ["RH", "Integração do ponto"],
  "/unidades": ["Configurações", "Unidades"],
  "/funcoes": ["Configurações", "Funções"],
  "/horarios": ["Configurações", "Horários"],
  "/regras": ["Configurações", "Regras e feriados"],
  "/regras-da-unidade": ["Configurações", "Regras da unidade"],
  "/usuarios": ["Configurações", "Usuários"],
  "/minha-conta": ["Minha conta"],
};

// Telas que usam a largura toda da área útil. As demais ficam numa coluna mais estreita.
export const rotasLargas = ["/vendas", "/rh", "/escala-mensal", "/ponto", "/ponto/colaborador", "/ponto-integracao"];

const combina = (rota: string, caminho: string) => caminho === rota || caminho.startsWith(rota + "/");

/** Destino do menu a que um caminho pertence (ou undefined se não pertence a nenhum). */
export function destinoDoCaminho(caminho: string): Destino | undefined {
  return destinos.find((d) => d.rotas.some((r) => combina(r, caminho)));
}

/** Quem pode abrir o caminho. Caminhos fora do menu ficam liberados. */
export function podeAcessar(perfil: PerfilAcesso, caminho: string): boolean {
  const d = destinoDoCaminho(caminho);
  return d ? d.perfis.includes(perfil) : true;
}

/** Primeira tela de cada perfil depois do login. */
export function destinoInicial(perfil: PerfilAcesso): string {
  return destinos.find((d) => d.perfis.includes(perfil))?.href ?? "/rh";
}

export const abaAtiva = (href: string, caminho: string) => combina(href, caminho);
