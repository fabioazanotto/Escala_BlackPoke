-- =====================================================================
-- Etapa 5 (parte 1): histórico das alterações feitas na escala.
-- Só acrescenta uma tabela nova. Não apaga nada. Pode rodar mais de uma vez.
-- =====================================================================

create table if not exists escala_alteracoes (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references escalas_mensais (id) on delete cascade,
  colaborador_id uuid not null references colaboradores (id) on delete cascade,
  data date not null,
  situacao_anterior text not null,
  situacao_nova text not null,
  travada_antes boolean not null default false,
  travada_depois boolean not null default false,
  motivo text,
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists escala_alteracoes_escala_idx on escala_alteracoes (escala_id, criado_em desc);

alter table escala_alteracoes enable row level security;
revoke all on escala_alteracoes from anon;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'escala_alteracoes' and policyname = 'acessa historico') then
    create policy "acessa historico" on escala_alteracoes for all to authenticated
      using (exists (select 1 from escalas_mensais e where e.id = escala_id and pode_unidade(e.unidade_id)))
      with check (exists (select 1 from escalas_mensais e where e.id = escala_id and pode_unidade(e.unidade_id)));
  end if;
end $$;
