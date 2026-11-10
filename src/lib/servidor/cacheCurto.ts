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
