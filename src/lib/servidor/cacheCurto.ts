// Cache curto em memória (vale por instância do servidor). Evita repetir a mesma consulta ao Secullum em poucos segundos.

const cache = new Map<string, { valor: unknown; expira: number }>();

export async function comCache<T>(chave: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
  const c = cache.get(chave);
  if (c && c.expira > Date.now()) return c.valor as T;
  const valor = await f();
  cache.set(chave, { valor, expira: Date.now() + ttlMs });
  return valor;
}

/** Só para testes. */
export const reiniciarCache = () => cache.clear();

/** Esquece as consultas guardadas cuja chave começa com o prefixo (depois de uma escrita, para a tela ler o dado novo). */
export function limparCachePorPrefixo(prefixo: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefixo)) cache.delete(k);
}

/** Cadastros do Secullum (funcionários, horários, justificativas) ficam guardados por pouco tempo: mudou lá, aparece aqui em até 2 minutos. */
export const TTL_CADASTROS_MS = 2 * 60000;

/** Esquece os cadastros e o que foi calculado com eles, para a próxima consulta buscar tudo de novo no Secullum (botão "Atualizar cadastros"). */
export function esquecerCadastros() {
  for (const prefixo of ["funcionarios", "horarios", "justificativas", "mes:", "batidas:", "afast:", "fonte:"]) limparCachePorPrefixo(prefixo);
}
