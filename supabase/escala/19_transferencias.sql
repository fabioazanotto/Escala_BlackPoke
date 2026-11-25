-- =====================================================================
-- Transferência de colaboradores entre unidades (parte do BlackPoke).
-- Cria UMA tabela nova (histórico) e UMA função. Não altera tabelas existentes. Pode rodar mais de uma vez.
-- A função faz tudo numa transação só: muda unidade, função e turno, remove as funções adicionais da unidade antiga
-- (funções são por unidade) e registra o histórico. NÃO mexe na escala (o app só avisa) e NÃO fala com o Secullum.
-- =====================================================================
create table if not exists transferencias_colaboradores (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  usuario_id uuid default auth.uid(),
  usuario_nome text,
  colaborador_id uuid not null references colaboradores (id) on delete cascade,
  nome_registrado text not null,
  unidade_origem_id uuid not null references unidades (id),
  unidade_destino_id uuid not null references unidades (id),
  funcao_origem_id uuid references funcoes (id),
  funcao_destino_id uuid references funcoes (id),
  turno_origem text,
  turno_destino text,
  data_inicio date not null,                      -- a partir de quando vale na unidade nova
  observacao text,
  funcoes_adicionais_removidas int not null default 0,
  check (unidade_origem_id <> unidade_destino_id)
);
create index if not exists transferencias_colaborador_idx on transferencias_colaboradores (colaborador_id, criado_em desc);
create index if not exists transferencias_origem_idx on transferencias_colaboradores (unidade_origem_id, data_inicio);

alter table transferencias_colaboradores enable row level security;
revoke all on transferencias_colaboradores from anon;
drop policy if exists "ver transferencias" on transferencias_colaboradores;
drop policy if exists "rh registra transferencias" on transferencias_colaboradores;
create policy "ver transferencias" on transferencias_colaboradores for select to authenticated
  using (eh_rh() or pode_unidade(unidade_origem_id) or pode_unidade(unidade_destino_id));
create policy "rh registra transferencias" on transferencias_colaboradores for insert to authenticated with check (eh_rh());

create or replace function transferir_colaborador(
  p_colaborador uuid, p_unidade_destino uuid, p_funcao_destino uuid, p_turno text,
  p_data date, p_observacao text, p_usuario_nome text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  c colaboradores%rowtype;
  removidas int := 0;
begin
  if not eh_rh() then raise exception 'Sem permissão para transferir colaboradores.'; end if;
  select * into c from colaboradores where id = p_colaborador for update;
  if not found then raise exception 'Colaborador não encontrado.'; end if;
  if not c.ativo then raise exception 'Este colaborador está inativo.'; end if;
  if c.unidade_id = p_unidade_destino then raise exception 'O colaborador já está nesta unidade.'; end if;
  if not exists (select 1 from unidades where id = p_unidade_destino and ativa) then raise exception 'Unidade de destino inválida.'; end if;
  if p_turno is null or p_turno not in ('dia', 'noite') then raise exception 'Escolha o turno.'; end if;
  if p_data is null then raise exception 'Informe a data de início na unidade nova.'; end if;
  if not exists (select 1 from funcoes where id = p_funcao_destino and unidade_id = p_unidade_destino and ativa) then
    raise exception 'A função escolhida não é uma função ativa da unidade de destino.';
  end if;
  if c.matricula is not null and exists (select 1 from colaboradores x where x.unidade_id = p_unidade_destino and x.matricula = c.matricula) then
    raise exception 'Já existe alguém com esta matrícula na unidade de destino.';
  end if;

  delete from colaborador_funcoes where colaborador_id = p_colaborador;
  get diagnostics removidas = row_count;

  update colaboradores set unidade_id = p_unidade_destino, funcao_principal_id = p_funcao_destino, turno = p_turno where id = p_colaborador;

  insert into transferencias_colaboradores (
    usuario_nome, colaborador_id, nome_registrado, unidade_origem_id, unidade_destino_id,
    funcao_origem_id, funcao_destino_id, turno_origem, turno_destino, data_inicio, observacao, funcoes_adicionais_removidas
  ) values (
    p_usuario_nome, p_colaborador, c.nome, c.unidade_id, p_unidade_destino,
    c.funcao_principal_id, p_funcao_destino, c.turno, p_turno, p_data, nullif(trim(coalesce(p_observacao, '')), ''), removidas
  );

  return jsonb_build_object('funcoes_adicionais_removidas', removidas);
end;
$$;

grant execute on function transferir_colaborador(uuid, uuid, uuid, text, date, text, text) to authenticated;
revoke execute on function transferir_colaborador(uuid, uuid, uuid, text, date, text, text) from anon;
