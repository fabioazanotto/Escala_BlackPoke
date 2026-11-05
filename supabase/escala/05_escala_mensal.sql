-- =====================================================================
-- Etapa 4: escala mensal (rascunho gerado pelo motor).
-- Só acrescenta tabelas novas. Não apaga nada. Pode rodar mais de uma vez.
-- RH e gerência acessam as unidades liberadas para eles.
-- =====================================================================

create table if not exists escalas_mensais (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades (id) on delete cascade,
  ano int not null check (ano between 2020 and 2100),
  mes int not null check (mes between 1 and 12),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'em_revisao', 'publicada', 'publicada_com_alteracoes')),
  versao int not null default 1,
  gerada_em timestamptz,
  gerada_por uuid,
  criado_em timestamptz not null default now(),
  unique (unidade_id, ano, mes)
);

create table if not exists escala_dias (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null references escalas_mensais (id) on delete cascade,
  colaborador_id uuid not null references colaboradores (id) on delete cascade,
  data date not null,
  situacao text not null
    check (situacao in ('trabalha', 'folga', 'domingo', 'ferias', 'afastamento', 'indisponibilidade', 'fora')),
  travado boolean not null default false,
  motivo text,
  unique (escala_id, colaborador_id, data)
);
create index if not exists escala_dias_escala_idx on escala_dias (escala_id);

drop trigger if exists auditar on escalas_mensais;
create trigger auditar after insert or update or delete on escalas_mensais
  for each row execute function registrar_auditoria();

alter table escalas_mensais enable row level security;
alter table escala_dias enable row level security;
revoke all on escalas_mensais, escala_dias from anon;

drop policy if exists "acessa escala" on escalas_mensais;
create policy "acessa escala" on escalas_mensais for all to authenticated
  using (pode_unidade(unidade_id)) with check (pode_unidade(unidade_id));

drop policy if exists "acessa dias da escala" on escala_dias;
create policy "acessa dias da escala" on escala_dias for all to authenticated
  using (exists (select 1 from escalas_mensais e where e.id = escala_id and pode_unidade(e.unidade_id)))
  with check (exists (select 1 from escalas_mensais e where e.id = escala_id and pode_unidade(e.unidade_id)));
