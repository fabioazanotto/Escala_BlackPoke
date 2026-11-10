-- =====================================================================
-- Histórico automático de vendas: guarda, por loja, até onde o histórico já
-- está completo. Só acrescenta uma coluna. Pode rodar mais de uma vez.
-- =====================================================================
alter table lojas_xmenu add column if not exists historico_desde date;
comment on column lojas_xmenu.historico_desde is
  'Dia mais antigo até onde o histórico de vendas desta loja já está completo (sem buracos até hoje). Nulo = ainda não começou.';
