-- =====================================================================
-- Auditoria das escritas feitas no Secullum pelo BlackPoke (justificar falta, afastamentos...).
-- Cria UMA tabela nova. Não altera nada que já existe. Pode rodar mais de uma vez.
-- Guarda quem fez, quando, o quê e o resultado. NUNCA guarda CPF, PIS nem senha.
-- Só o admin lê e acrescenta; ninguém altera nem apaga (registro só cresce).
-- =====================================================================
create table if not exists secullum_escritas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  lancado_por uuid default auth.uid(),
  lancado_por_nome text,
  funcionario_ponto_id int not null,                 -- código no Secullum
  nome_registrado text not null,
  acao text not null check (acao in ('justificar', 'remover_justificativa', 'afastamento', 'remover_afastamento')),
  dia_inicio date not null,
  dia_fim date,
  detalhe jsonb not null default '{}'::jsonb,        -- justificativa, grupos, motivo... (sem dados pessoais)
  status text not null check (status in ('ok', 'parcial', 'erro')),
  mensagem text
);
create index if not exists secullum_escritas_recentes_idx on secullum_escritas (criado_em desc);
create index if not exists secullum_escritas_func_idx on secullum_escritas (funcionario_ponto_id, criado_em desc);

alter table secullum_escritas enable row level security;
revoke all on secullum_escritas from anon;
drop policy if exists "admin le" on secullum_escritas;
drop policy if exists "admin acrescenta" on secullum_escritas;
create policy "admin le" on secullum_escritas for select to authenticated using (eh_admin());
create policy "admin acrescenta" on secullum_escritas for insert to authenticated with check (eh_admin());
