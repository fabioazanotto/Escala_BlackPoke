-- =====================================================================
-- Etapa 6: regras da unidade (folga fixa, alternância, dobra, dia sem funcionamento)
-- e a situação "dobra" na escala.
-- Acrescenta uma tabela e amplia a lista de situações aceitas. Não apaga dados.
-- Pode rodar mais de uma vez.
-- =====================================================================

create table if not exists regras_unidade (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades (id) on delete cascade,
  tipo text not null check (tipo in ('folga_fixa', 'alternancia', 'dobra', 'dia_fechado')),
  nome text not null,
  parametros jsonb not null default '{}'::jsonb,
  ativa boolean not null default true,
  criada_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists regras_unidade_idx on regras_unidade (unidade_id, ativa);

drop trigger if exists auditar on regras_unidade;
create trigger auditar after insert or update or delete on regras_unidade
  for each row execute function registrar_auditoria();

alter table regras_unidade enable row level security;
revoke all on regras_unidade from anon;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regras_unidade' and policyname = 'ver regras') then
    create policy "ver regras" on regras_unidade for select to authenticated using (pode_unidade(unidade_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'regras_unidade' and policyname = 'rh altera regras') then
    create policy "rh altera regras" on regras_unidade for all to authenticated using (eh_rh()) with check (eh_rh());
  end if;
end $$;

-- A escala passa a aceitar a situação "dobra" (trabalha os dois turnos no dia).
alter table escala_dias drop constraint if exists escala_dias_situacao_check;
alter table escala_dias add constraint escala_dias_situacao_check
  check (situacao in ('trabalha', 'folga', 'domingo', 'ferias', 'afastamento', 'indisponibilidade', 'dobra', 'fora'));
