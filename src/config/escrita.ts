// Controles da ESCRITA no Secullum (justificar falta, afastamentos...). Só o creator usa, e só no que estiver liberado aqui.

/**
 * MODO TESTE: enquanto for `true`, o app só escreve no Secullum para funcionário cujo nome começa com "Teste".
 * Desligado em 17/11/2026, depois de testar no Secullum: justificar, remover justificativa, lançar e apagar afastamento.
 * A escrita continua só para o creator. Para voltar ao modo teste, troque para `true`.
 */
export const MODO_TESTE_ESCRITA = false;
export const PALAVRA_DO_FUNCIONARIO_TESTE = "teste";

/** Janela de datas aceitas (em dias a partir de hoje) para justificar falta e lançar afastamento. */
export const DIAS_PARA_TRAS_MAX = 120;
export const DIAS_PARA_FRENTE_MAX = 400;
/** Afastamento muito longo provavelmente é engano de data. */
export const AFASTAMENTO_MAX_DIAS = 366;
