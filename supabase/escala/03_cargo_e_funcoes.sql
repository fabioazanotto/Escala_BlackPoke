-- =====================================================================
-- Etapa 2: cargo do colaborador + proteção contra funções duplicadas.
-- Não apaga nada. Pode rodar mais de uma vez.
-- =====================================================================

-- Cargo como aparece na planilha/RH ("ajd cozinha", "aux cozinha"...).
-- A função (posto) continua separada: cargos diferentes podem ter a mesma função.
alter table colaboradores add column if not exists cargo text;

-- Impede duas funções iguais na mesma unidade (inclusive quando não há operação).
create unique index if not exists funcoes_unica
  on funcoes (unidade_id, nome, coalesce(operacao, ''));
