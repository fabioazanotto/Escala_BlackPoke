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

export type Destino = {
  rotulo: string;
  href: string;
  icone: NomeIcone;
  rotas: string[]; // rotas que mantêm este destino marcado como ativo
  perfis: PerfilAcesso[]; // quem enxerga e pode abrir este destino
};

export const destinos: Destino[] = [
  { rotulo: "Vendas", href: "/vendas", icone: "vendas", rotas: ["/vendas"], perfis: ["admin"] },
  {
    rotulo: "RH",
    href: "/rh",
    icone: "rh",
    rotas: ["/rh", "/escala-mensal", "/colaboradores", "/ausencias", "/cobertura", "/ponto", "/ponto-integracao"],
    perfis: ["rh", "gerencia", "admin"],
  },
  {
    rotulo: "Configurações",
    href: "/unidades",
    icone: "configuracoes",
    rotas: ["/unidades", "/funcoes", "/horarios", "/regras", "/regras-da-unidade"],
    perfis: ["rh", "gerencia", "admin"],
  },
];

// Abas dentro do RH.
export const abasRH: { rotulo: string; href: string }[] = [
  { rotulo: "Visão geral", href: "/rh" },
  { rotulo: "Escala do mês", href: "/escala-mensal" },
  { rotulo: "Colaboradores", href: "/colaboradores" },
  { rotulo: "Ausências", href: "/ausencias" },
  { rotulo: "Cobertura", href: "/cobertura" },
  { rotulo: "Ponto", href: "/ponto" },
  { rotulo: "Integração do ponto", href: "/ponto-integracao" },
];

// Abas dentro de Configurações.
export const abasConfiguracoes: { rotulo: string; href: string }[] = [
  { rotulo: "Unidades", href: "/unidades" },
  { rotulo: "Funções", href: "/funcoes" },
  { rotulo: "Horários", href: "/horarios" },
  { rotulo: "Regras e feriados", href: "/regras" },
  { rotulo: "Regras da unidade", href: "/regras-da-unidade" },
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
  "/ponto": ["RH", "Ponto"],
  "/ponto-integracao": ["RH", "Integração do ponto"],
  "/unidades": ["Configurações", "Unidades"],
  "/funcoes": ["Configurações", "Funções"],
  "/horarios": ["Configurações", "Horários"],
  "/regras": ["Configurações", "Regras e feriados"],
  "/regras-da-unidade": ["Configurações", "Regras da unidade"],
};

// Telas que usam a largura toda da área útil. As demais ficam numa coluna mais estreita.
export const rotasLargas = ["/vendas", "/rh", "/escala-mensal"];

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
