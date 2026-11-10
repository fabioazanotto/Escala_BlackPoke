import type { CanalVenda } from "@/lib/tipos";

/** Cor fixa de cada canal (variáveis em globals.css). */
export const COR_CANAL: Record<CanalVenda, string> = {
  xmenu: "var(--canal-xmenu)",
  ifood: "var(--canal-ifood)",
  balcao: "var(--canal-balcao)",
  outros: "var(--canal-outros)",
};
