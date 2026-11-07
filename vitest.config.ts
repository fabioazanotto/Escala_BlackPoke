import path from "node:path";
import { defineConfig } from "vitest/config";

// Faz o atalho "@/" dos testes apontar para a pasta src, como no resto do projeto.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
