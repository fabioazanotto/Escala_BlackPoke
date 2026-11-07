import type { Metadata } from "next";
import "./globals.css";
import { identidade } from "@/config/identidade";
import { Estrutura } from "@/components/Estrutura";
import { Sessao } from "@/components/Sessao";

export const metadata: Metadata = {
  title: `Gestão · ${identidade.nome}`,
  description: "Sistema de gestão do restaurante",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // As cores da identidade viram variáveis CSS para toda a aplicação.
  const estilo = {
    "--cor-principal": identidade.corPrincipal,
    "--cor-secundaria": identidade.corSecundaria,
    "--cor-destaque": identidade.corDestaque,
  } as React.CSSProperties;

  return (
    <html lang="pt-BR" className="h-full antialiased" style={estilo}>
      <body className="min-h-full">
        <Sessao>
          <Estrutura>{children}</Estrutura>
        </Sessao>
      </body>
    </html>
  );
}
