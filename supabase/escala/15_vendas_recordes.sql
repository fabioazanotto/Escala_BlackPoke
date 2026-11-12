-- =====================================================================
-- Recordes de vendas por loja (melhor dia de caixa em pedidos e em faturamento).
-- Só acrescenta tabelas novas, uma função e UMA coluna em lojas_xmenu. Não apaga nada. Pode rodar mais de uma vez.
-- Só o admin lê. Quem calcula é o servidor, depois de cada atualização das vendas.
-- =====================================================================

-- Lojas que entram nos alertas de recorde (o ABC, que vai fechar, fica de fora).
alter table lojas_xmenu add column if not exists alertar_recordes boolean not null default true;
update lojas_xmenu set alertar_recordes = false where chave = 'abc';

-- Cada linha é um recorde. O vigente de cada loja e métrica é o mais recente. "alerta" falso = ponto de partida ou
-- recorde antigo (histórico carregado depois), que NÃO gera aviso; verdadeiro = recorde recente, que gera pop-up e faixa.
create table if not exists vendas_recordes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas_xmenu (id) on delete cascade,
  metrica text not null check (metrica in ('pedidos', 'faturamento')),
  dia date not null,                       -- dia de caixa do recorde
  valor numeric(12, 2) not null,
  anterior numeric(12, 2),                 -- recorde que foi superado
  anterior_dia date,
  alerta boolean not null default false,
  detectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists vendas_recordes_loja_idx on vendas_recordes (loja_id, metrica, detectado_em desc);

-- Quem já viu o pop-up e quem já dispensou a faixa verde (cada admin por si).
create table if not exists vendas_recordes_vistos (
  recorde_id uuid not null references vendas_recordes (id) on delete cascade,
  usuario_id uuid not null references perfis (id) on delete cascade,
  tipo text not null check (tipo in ('popup', 'faixa')),
  em timestamptz not null default now(),
  primary key (recorde_id, usuario_id, tipo)
);

-- ---------- Atualização dos recordes ----------
create or replace function vendas_atualizar_recordes(p_hoje date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  m text;
  melhor record;
  vig vendas_recordes%rowtype;
  novos int := 0;
  recente boolean;
begin
  for l in select id, alertar_recordes from lojas_xmenu where ativa loop
    foreach m in array array['pedidos', 'faturamento'] loop
      -- Melhor dia de caixa da loja nesta métrica (pedidos sem cancelados; faturamento líquido).
      select d.dia, d.valor into melhor from (
        select data_caixa as dia, case when m = 'pedidos' then sum(pedidos)::numeric else sum(liquido) end as valor
        from vendas_resumo where loja_id = l.id group by data_caixa
      ) d where d.valor > 0 order by d.valor desc, d.dia asc limit 1;
      if not found then continue; end if;

      select * into vig from vendas_recordes where loja_id = l.id and metrica = m order by detectado_em desc limit 1;
      if not found then
        -- Ponto de partida: o melhor dia que já existe. Sem aviso.
        insert into vendas_recordes (loja_id, metrica, dia, valor, alerta) values (l.id, m, melhor.dia, melhor.valor, false);
        continue;
      end if;

      if melhor.valor > vig.valor then
        if melhor.dia = vig.dia then
          update vendas_recordes set valor = melhor.valor, atualizado_em = now() where id = vig.id; -- o mesmo dia seguiu crescendo
        else
          recente := l.alertar_recordes and melhor.dia >= p_hoje - 2; -- dia antigo (histórico carregado depois) não gera aviso
          insert into vendas_recordes (loja_id, metrica, dia, valor, anterior, anterior_dia, alerta)
          values (l.id, m, melhor.dia, melhor.valor, vig.valor, vig.dia, recente);
          if recente then novos := novos + 1; end if;
        end if;
      elsif melhor.valor < vig.valor then
        -- O dia do recorde diminuiu (cancelamentos, reprocesso): o recorde acompanha o melhor dia de agora.
        update vendas_recordes set dia = melhor.dia, valor = melhor.valor, atualizado_em = now() where id = vig.id;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('novos_alertas', novos);
end;
$$;

revoke all on function vendas_atualizar_recordes(date) from public, anon, authenticated;
grant execute on function vendas_atualizar_recordes(date) to service_role;

-- ---------- Segurança: só o admin ----------
alter table vendas_recordes enable row level security;
alter table vendas_recordes_vistos enable row level security;
revoke all on vendas_recordes, vendas_recordes_vistos from anon;

drop policy if exists "admin ve" on vendas_recordes;
create policy "admin ve" on vendas_recordes for select to authenticated using (eh_admin());

drop policy if exists "admin ve os seus" on vendas_recordes_vistos;
drop policy if exists "admin marca os seus" on vendas_recordes_vistos;
create policy "admin ve os seus" on vendas_recordes_vistos for select to authenticated using (eh_admin() and usuario_id = auth.uid());
create policy "admin marca os seus" on vendas_recordes_vistos for insert to authenticated with check (eh_admin() and usuario_id = auth.uid());
