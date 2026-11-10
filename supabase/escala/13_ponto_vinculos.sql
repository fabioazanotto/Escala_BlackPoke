-- =====================================================================
-- Ponto (Secullum), Fase 2: vínculo entre colaborador do BlackPoke e funcionário do Secullum.
-- SÓ ESTRUTURA, sem dados. Só acrescenta uma tabela nova. Pode rodar mais de uma vez.
-- Só o admin enxerga e altera. Não guarda CPF: guarda só os números de identificação.
-- Um vínculo nunca é apagado: ao desfazer, a vigência termina (fica o histórico).
-- =====================================================================

create table if not exists colaborador_ponto_ids (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores (id) on delete cascade,
  banco_id uuid not null references ponto_bancos (id) on delete cascade,
  secullum_funcionario_id int not null,       -- Id do funcionário no Secullum (o mesmo FuncionarioId das batidas)
  secullum_empresa_id int,
  origem text not null default 'manual' check (origem in ('manual', 'cpf', 'nome')),
  vigencia_inicio date not null default current_date,
  vigencia_fim date,                          -- vazio = vínculo em vigor
  confirmado_por uuid references perfis (id),
  confirmado_em timestamptz not null default now(),
  observacao text
);

-- Um funcionário do Secullum só pode estar ligado a um colaborador por vez, e vice-versa.
create unique index if not exists colaborador_ponto_ids_func_vigente
  on colaborador_ponto_ids (banco_id, secullum_funcionario_id) where vigencia_fim is null;
create unique index if not exists colaborador_ponto_ids_colab_vigente
  on colaborador_ponto_ids (colaborador_id, banco_id) where vigencia_fim is null;

drop trigger if exists auditar on colaborador_ponto_ids;
create trigger auditar after insert or update or delete on colaborador_ponto_ids
  for each row execute function registrar_auditoria();

alter table colaborador_ponto_ids enable row level security;
revoke all on colaborador_ponto_ids from anon;
drop policy if exists "admin" on colaborador_ponto_ids;
create policy "admin" on colaborador_ponto_ids for all to authenticated using (eh_admin()) with check (eh_admin());
