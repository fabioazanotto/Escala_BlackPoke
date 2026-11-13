// Controles da ESCRITA no Secullum (justificar falta, afastamentos...). Só o creator usa, e só no que estiver liberado aqui.

/**
 * MODO TESTE: enquanto for `true`, o app só escreve no Secullum para funcionário cujo nome começa com "Teste".
 * Só mude para `false` depois de conferir, no próprio Secullum, o resultado dos testes.
 */
export const MODO_TESTE_ESCRITA = true;
export const PALAVRA_DO_FUNCIONARIO_TESTE = "teste";

/** Janela de datas aceitas (em dias a partir de hoje) para justificar falta e lançar afastamento. */
export const DIAS_PARA_TRAS_MAX = 120;
export const DIAS_PARA_FRENTE_MAX = 400;
/** Afastamento muito longo provavelmente é engano de data. */
export const AFASTAMENTO_MAX_DIAS = 366;
