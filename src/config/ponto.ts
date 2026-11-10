// Parâmetros OPERACIONAIS da visão ao vivo do ponto. Não são regras trabalhistas: não geram desconto, hora extra nem penalidade.
// Mude aqui os números; a classificação inteira acompanha.

/** O "dia de trabalho" só vira às 05:00: a saída às 00:20 do turno da noite ainda pertence ao dia anterior. */
export const DIA_DE_TRABALHO_VIRA_AS = 5;

/** Até quantos minutos depois do horário previsto de entrada ainda conta como "presente" (sem atraso). */
export const TOLERANCIA_ATRASO_MIN = 5;

/** Sem nenhuma batida depois de tantos minutos do horário previsto: "ausente". (O mesmo vale no fim do turno: "falta".) */
export const AUSENTE_APOS_MIN = 20;

/** Intervalo aberto há mais que isso recebe um alerta. */
export const INTERVALO_ALERTA_MIN = 60;

/** Saída do intervalo muito perto do fim do turno conta como encerramento. */
export const MARGEM_ENCERRAMENTO_MIN = 30;

/** A tela busca de novo a cada tantos segundos enquanto está aberta. */
export const ATUALIZAR_A_CADA_S = 60;
