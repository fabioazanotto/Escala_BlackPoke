-- =====================================================================
-- Ponto (Secullum), Fase 2: batidas sincronizadas. SÓ ESTRUTURA, sem dados.
-- Só acrescenta tabelas novas e UMA coluna em ponto_bancos. Não apaga nada. Pode rodar mais de uma vez.
-- Não guarda CPF nem PIS. Só o admin lê; quem grava é o servidor (chave de serviço).
-- Nada é sobrescrito em silêncio: se uma batida mudar ou sumir no Secullum, a versão anterior fica no histórico.
-- =====================================================================

alter table ponto_bancos add column if not exists ultimo_fonte_id bigint; -- até que ID de batida já foi lido

-- ---------- Batidas (uma linha por batida do Secullum, "FonteDados") ----------
create table if not exists ponto_marcacoes (
  id uuid primary key default gen_random_uuid(),
  banco_id uuid not null references ponto_bancos (id) on delete cascade,
  fonte_id bigint not null,                 -- Id da batida no Secullum
  secullum_funcionario_id int not null,
  secullum_empresa_id int,
  data date not null,                       -- data da marcação
  hora text not null,                       -- exatamente como veio (a jornada pode virar a meia-noite)
  tipo smallint not null,                   -- 0 original, 1 manual, 2 pré-assinalada, 3 desconsiderada
  origem smallint not null,                 -- número bruto (há valores fora do manual, como 16)
  equipamento_id int,
  motivo text,
  data_inclusao text,                       -- quando o Secullum recebeu a batida (texto como veio)
  hash text not null,                       -- impressão dos campos acima, para detectar mudança
  versao int not null default 1,
  removida_em timestamptz,                  -- o Secullum deixou de devolver esta batida
  primeira_vez_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  unique (banco_id, fonte_id)
);
create index if not exists ponto_marcacoes_func_data_idx on ponto_marcacoes (banco_id, secullum_funcionario_id, data);
create index if not exists ponto_marcacoes_data_idx on ponto_marcacoes (data);

-- ---------- Versões anteriores ----------
create table if not exists ponto_marcacoes_historico (
  id uuid primary key default gen_random_uuid(),
  marcacao_id uuid not null references ponto_marcacoes (id) on delete cascade,
  versao int not null,
  snapshot jsonb not null,
  substituida_em timestamptz not null default now(),
  unique (marcacao_id, versao)
);

-- ---------- Registro das sincronizações (e trava contra duas rodadas ao mesmo tempo) ----------
create table if not exists ponto_sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  banco_id uuid not null references ponto_bancos (id) on delete cascade,
  tipo text not null check (tipo in ('inicial', 'incremental', 'reprocesso')),
  origem text not null default 'automatica' check (origem in ('automatica', 'manual')),
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'erro')),
  data_de date,
  data_ate date,
  lidas int not null default 0,
  descartadas int not null default 0,        -- de funcionários fora das empresas do projeto
  novas int not null default 0,
  alteradas int not null default 0,
  removidas int not null default 0,
  mensagem text,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create unique index if not exists ponto_sincronizacoes_uma_rodando on ponto_sincronizacoes (banco_id) where status = 'rodando';
create index if not exists ponto_sincronizacoes_recentes_idx on ponto_sincronizacoes (iniciado_em desc);

-- ---------- Gravação atômica de um lote ----------
-- Insere o que é novo; se uma batida mudou (ou voltou depois de removida), guarda a versão anterior no histórico e atualiza;
-- se p_de/p_ate vierem, batidas daquela janela que o Secullum não devolveu mais são marcadas como removidas (com histórico).
create or replace function ponto_gravar_marcacoes(p_banco uuid, p_linhas jsonb, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  atual ponto_marcacoes%rowtype;
  v_ids bigint[];
  novas int := 0; alteradas int := 0; iguais int := 0; removidas int := 0;
begin
  for r in
    select * from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x (
      fonte_id bigint, secullum_funcionario_id int, secullum_empresa_id int, data date, hora text, tipo smallint,
      origem smallint, equipamento_id int, motivo text, data_inclusao text, hash text)
  loop
    select * into atual from ponto_marcacoes where banco_id = p_banco and fonte_id = r.fonte_id for update;
    if not found then
      insert into ponto_marcacoes (banco_id, fonte_id, secullum_funcionario_id, secullum_empresa_id, data, hora, tipo, origem, equipamento_id, motivo, data_inclusao, hash)
      values (p_banco, r.fonte_id, r.secullum_funcionario_id, r.secullum_empresa_id, r.data, r.hora, r.tipo, r.origem, r.equipamento_id, r.motivo, r.data_inclusao, r.hash);
      novas := novas + 1;
    elsif atual.hash is distinct from r.hash or atual.removida_em is not null then
      insert into ponto_marcacoes_historico (marcacao_id, versao, snapshot) values (atual.id, atual.versao, to_jsonb(atual));
      update ponto_marcacoes set
        secullum_funcionario_id = r.secullum_funcionario_id, secullum_empresa_id = r.secullum_empresa_id, data = r.data, hora = r.hora,
        tipo = r.tipo, origem = r.origem, equipamento_id = r.equipamento_id, motivo = r.motivo, data_inclusao = r.data_inclusao,
        hash = r.hash, versao = atual.versao + 1, removida_em = null, atualizada_em = now()
      where id = atual.id;
      alteradas := alteradas + 1;
    else
      iguais := iguais + 1;
    end if;
  end loop;

  if p_de is not null and p_ate is not null then
    v_ids := array(select fonte_id from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as y (fonte_id bigint));
    for atual in
      select * from ponto_marcacoes m
      where m.banco_id = p_banco and m.data between p_de and p_ate and m.removida_em is null and not (m.fonte_id = any (v_ids))
      for update
    loop
      insert into ponto_marcacoes_historico (marcacao_id, versao, snapshot) values (atual.id, atual.versao, to_jsonb(atual));
      update ponto_marcacoes set removida_em = now(), versao = atual.versao + 1, atualizada_em = now() where id = atual.id;
      removidas := removidas + 1;
    end loop;
  end if;

  return jsonb_build_object('novas', novas, 'alteradas', alteradas, 'iguais', iguais, 'removidas', removidas);
end;
$$;

revoke all on function ponto_gravar_marcacoes(uuid, jsonb, date, date) from public, anon, authenticated;
grant execute on function ponto_gravar_marcacoes(uuid, jsonb, date, date) to service_role;

-- ---------- Segurança: só o admin lê ----------
alter table ponto_marcacoes enable row level security;
alter table ponto_marcacoes_historico enable row level security;
alter table ponto_sincronizacoes enable row level security;
revoke all on ponto_marcacoes, ponto_marcacoes_historico, ponto_sincronizacoes from anon;

do $$
declare t text;
begin
  foreach t in array array['ponto_marcacoes', 'ponto_marcacoes_historico', 'ponto_sincronizacoes'] loop
    execute format('drop policy if exists "admin ve" on %I', t);
    execute format('create policy "admin ve" on %I for select to authenticated using (eh_admin())', t);
  end loop;
end $$;
-- Não há política de escrita: só a chave de serviço (servidor) grava.
