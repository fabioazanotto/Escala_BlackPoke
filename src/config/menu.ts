// Navegação principal (sidebar). Cada tela nova entra aqui.

export type NomeIcone = "painel" | "escala" | "colaboradores" | "ausencias" | "cobertura" | "configuracoes";

export type Destino = {
  rotulo: string;
  href: string;
  icone: NomeIcone;
  rotas: string[]; // rotas que mantêm este destino marcado como ativo
};

export const destinos: Destino[] = [
  { rotulo: "Painel", href: "/", icone: "painel", rotas: ["/"] },
  { rotulo: "Escala do mês", href: "/escala-mensal", icone: "escala", rotas: ["/escala-mensal"] },
  { rotulo: "Colaboradores", href: "/colaboradores", icone: "colaboradores", rotas: ["/colaboradores"] },
  { rotulo: "Ausências", href: "/ausencias", icone: "ausencias", rotas: ["/ausencias"] },
  { rotulo: "Cobertura", href: "/cobertura", icone: "cobertura", rotas: ["/cobertura"] },
  {
    rotulo: "Configurações",
    href: "/unidades",
    icone: "configuracoes",
    rotas: ["/unidades", "/funcoes", "/horarios", "/regras"],
  },
];

// Abas dentro de Configurações.
export const abasConfiguracoes: { rotulo: string; href: string }[] = [
  { rotulo: "Unidades", href: "/unidades" },
  { rotulo: "Funções", href: "/funcoes" },
  { rotulo: "Horários", href: "/horarios" },
  { rotulo: "Regras e feriados", href: "/regras" },
];

// Caminho mostrado na barra superior.
export const trilhas: Record<string, string[]> = {
  "/": ["Painel"],
  "/escala-mensal": ["Escala do mês"],
  "/colaboradores": ["Colaboradores"],
  "/colaboradores/importar": ["Colaboradores", "Importar planilha"],
  "/ausencias": ["Ausências"],
  "/cobertura": ["Cobertura"],
  "/unidades": ["Configurações", "Unidades"],
  "/funcoes": ["Configurações", "Funções"],
  "/horarios": ["Configurações", "Horários"],
  "/regras": ["Configurações", "Regras e feriados"],
};

// Telas que usam a largura toda da área útil. As demais ficam numa coluna mais estreita.
export const rotasLargas = ["/", "/escala-mensal"];
