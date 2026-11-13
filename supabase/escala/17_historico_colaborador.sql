-- =====================================================================
-- Histórico do colaborador: faltas, atrasos, atestados, advertências e observações.
-- Cria UMA tabela nova. Não altera nada que já existe. Pode rodar mais de uma vez.
-- Só o admin enxerga e grava (atestado é dado de saúde: guardamos só data e período,
-- NUNCA o diagnóstico/CID).
-- A chave é o código do funcionário no Secullum (o mesmo da tela "Ponto por colaborador"),
-- então funciona também para quem ainda não está vinculado a um colaborador do BlackPoke.
-- =====================================================================
create table if not exists ocorrencias_colaborador (
  id uuid primary key default gen_random_uuid(),
  funcionario_ponto_id int not null,                       -- código no Secullum
  colaborador_id uuid references colaboradores (id) on delete set null,
  nome_registrado text not null,                           -- nome na hora do registro (o histórico não muda se o nome mudar)
  tipo text not null check (tipo in ('falta', 'atraso', 'atestado', 'advertencia', 'observacao')),
  data_inicio date not null,
  data_fim date,                                           -- vazio = um dia só
  minutos int check (minutos is null or minutos >= 0),     -- só para atraso
  descricao text,
  origem text not null check (origem in ('automatica', 'manual')),
  lancado_por uuid default auth.uid(),
  lancado_por_nome text,
  criado_em timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio)
);
create index if not exists ocorrencias_colaborador_func_idx on ocorrencias_colaborador (funcionario_ponto_id, data_inicio desc);

alter table ocorrencias_colaborador enable row level security;
revoke all on ocorrencias_colaborador from anon;
drop policy if exists "admin tudo" on ocorrencias_colaborador;
create policy "admin tudo" on ocorrencias_colaborador for all to authenticated using (eh_admin()) with check (eh_admin());
