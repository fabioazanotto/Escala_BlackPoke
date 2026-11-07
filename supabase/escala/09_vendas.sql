-- =====================================================================
-- Etapa 3 do app de gestão: banco de vendas (Xmenu).
-- Só acrescenta tabelas novas. Não apaga nada. Pode rodar mais de uma vez.
-- Guardamos SÓ TOTAIS por loja, dia de caixa, turno e canal.
-- Nunca guardamos nome, telefone ou endereço de cliente.
-- Só o admin enxerga estas tabelas. Quem grava é o servidor (chave de serviço).
-- =====================================================================

-- ---------- Lojas do Xmenu ----------
-- Os tokens NÃO ficam aqui: ficam nas variáveis de ambiente da Vercel.
create table if not exists lojas_xmenu (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,        -- pg, santos, miyagi, abc
  store_id text not null unique,     -- código da loja no Xmenu
  nome text not null,
  ativa boolean not null default true
);

insert into lojas_xmenu (chave, store_id, nome) values
  ('pg', '20210', 'BlackPoke Praia Grande'),
  ('santos', '20211', 'BlackPoke Santos'),
  ('miyagi', '20773', 'Seu Miyagi Sushi'),
  ('abc', '22010', 'BlackPoke ABC')
on conflict (chave) do nothing;

-- ---------- Totais de vendas ----------
create table if not exists vendas_resumo (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas_xmenu (id) on delete cascade,
  data_caixa date not null,
  periodo text not null check (periodo in ('manha', 'tarde', 'noite', 'indefinido')),
  canal text not null check (canal in ('balcao', 'ifood', 'xmenu', 'outros')),
  pedidos int not null default 0,
  cancelados int not null default 0,
  bruto numeric(12, 2) not null default 0,
  desconto_comercial numeric(12, 2) not null default 0,
  desconto_funcionarios numeric(12, 2) not null default 0,
  taxa_entrega numeric(12, 2) not null default 0,
  liquido numeric(12, 2) not null default 0,
  valor_cancelado numeric(12, 2) not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (loja_id, data_caixa, periodo, canal)
);
create index if not exists vendas_resumo_data_idx on vendas_resumo (data_caixa, loja_id);

-- ---------- Registro das sincronizações ----------
create table if not exists sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas_xmenu (id) on delete cascade,
  origem text not null check (origem in ('automatica', 'manual', 'historico')),
  data_de date not null,
  data_ate date not null,
  status text not null check (status in ('ok', 'erro')),
  dias_gravados int not null default 0,
  mensagem text,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz not null default now()
);
create index if not exists sincronizacoes_recentes_idx on sincronizacoes (concluido_em desc);

-- ---------- Troca atômica dos totais de um dia ----------
-- Apaga as linhas daquele dia/loja e grava as novas na mesma transação:
-- rodar duas vezes dá o mesmo resultado, e uma venda cancelada depois some sozinha.
create or replace function substituir_vendas_dia(p_loja_id uuid, p_data date, p_linhas jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  delete from vendas_resumo where loja_id = p_loja_id and data_caixa = p_data;
  insert into vendas_resumo (
    loja_id, data_caixa, periodo, canal, pedidos, cancelados, bruto,
    desconto_comercial, desconto_funcionarios, taxa_entrega, liquido, valor_cancelado
  )
  select
    p_loja_id, p_data, l.periodo, l.canal, l.pedidos, l.cancelados, l.bruto,
    l.desconto_comercial, l.desconto_funcionarios, l.taxa_entrega, l.liquido, l.valor_cancelado
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as l (
    periodo text, canal text, pedidos int, cancelados int, bruto numeric,
    desconto_comercial numeric, desconto_funcionarios numeric, taxa_entrega numeric,
    liquido numeric, valor_cancelado numeric
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Só o servidor (chave de serviço) pode chamar a função.
revoke all on function substituir_vendas_dia(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function substituir_vendas_dia(uuid, date, jsonb) to service_role;

-- ---------- Segurança: só o admin lê ----------
alter table lojas_xmenu enable row level security;
alter table vendas_resumo enable row level security;
alter table sincronizacoes enable row level security;
revoke all on lojas_xmenu, vendas_resumo, sincronizacoes from anon;

drop policy if exists "admin ve" on lojas_xmenu;
drop policy if exists "admin ve" on vendas_resumo;
drop policy if exists "admin ve" on sincronizacoes;
create policy "admin ve" on lojas_xmenu for select to authenticated using (eh_admin());
create policy "admin ve" on vendas_resumo for select to authenticated using (eh_admin());
create policy "admin ve" on sincronizacoes for select to authenticated using (eh_admin());
-- Não há política de escrita: apenas a chave de serviço (servidor) grava.
