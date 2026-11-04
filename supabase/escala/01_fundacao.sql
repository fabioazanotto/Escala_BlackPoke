-- =====================================================================
-- Sistema Inteligente de Escalas · Etapa 1: fundação
-- PARA UM PROJETO SUPABASE NOVO E SEPARADO (não rode no projeto de estoque).
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Não tem nenhum colaborador de exemplo: os reais entram pela importação.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
do $$ begin
  create type perfil_acesso as enum ('rh', 'gerencia');
exception when duplicate_object then null; end $$;

-- ---------- Unidades (ilimitadas; cadastradas pela tela, sem mexer no código) ----------
create table if not exists unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Usuários do sistema (RH e gerência) ----------
create table if not exists perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  perfil perfil_acesso not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Quais unidades cada gerente pode acessar (o RH acessa todas)
create table if not exists usuario_unidades (
  usuario_id uuid not null references perfis (id) on delete cascade,
  unidade_id uuid not null references unidades (id) on delete cascade,
  primary key (usuario_id, unidade_id)
);

-- ---------- Funções (postos) de cada unidade ----------
-- "operacao" distingue, por exemplo, cozinheiro do Seu Miyagi e do BlackPoke.
create table if not exists funcoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades (id) on delete cascade,
  nome text not null,
  operacao text,
  ativa boolean not null default true,
  unique (unidade_id, nome, operacao)
);

-- ---------- Colaboradores ----------
create table if not exists colaboradores (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades (id),
  nome text not null,
  matricula text,
  cpf text,
  telefone text,
  funcao_principal_id uuid not null references funcoes (id),
  turno text not null check (turno in ('dia', 'noite')), -- turno fixo
  data_admissao date,
  data_desligamento date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check (data_desligamento is null or data_admissao is null or data_desligamento >= data_admissao)
);
create unique index if not exists colaboradores_cpf_unico on colaboradores (cpf) where cpf is not null;
create unique index if not exists colaboradores_matricula_unica on colaboradores (unidade_id, matricula) where matricula is not null;
create index if not exists colaboradores_unidade_idx on colaboradores (unidade_id);

-- Funções adicionais que o colaborador está EXPRESSAMENTE autorizado a exercer
create table if not exists colaborador_funcoes (
  colaborador_id uuid not null references colaboradores (id) on delete cascade,
  funcao_id uuid not null references funcoes (id) on delete cascade,
  primary key (colaborador_id, funcao_id)
);

-- ---------- Auditoria ----------
create table if not exists auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid,
  acao text not null,            -- insert / update / delete
  tabela text not null,
  registro_id text,
  antes jsonb,
  depois jsonb,
  motivo text,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_tabela_idx on auditoria (tabela, criado_em desc);

-- ---------- Funções de apoio para as regras de acesso ----------
create or replace function eh_rh() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and perfil = 'rh' and ativo);
$$;

create or replace function pode_unidade(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_rh() or exists (
    select 1 from usuario_unidades uu join perfis p on p.id = uu.usuario_id
    where uu.usuario_id = auth.uid() and uu.unidade_id = u and p.ativo
  );
$$;

-- ---------- Gatilho de auditoria ----------
create or replace function registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (usuario_id, acao, tabela, registro_id, antes, depois)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', ''),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['unidades', 'perfis', 'usuario_unidades', 'funcoes', 'colaboradores'] loop
    execute format('drop trigger if exists auditar on %I', t);
    execute format('create trigger auditar after insert or update or delete on %I for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

-- ---------- Segurança: só usuários logados; nada para visitantes ----------
alter table unidades enable row level security;
alter table perfis enable row level security;
alter table usuario_unidades enable row level security;
alter table funcoes enable row level security;
alter table colaboradores enable row level security;
alter table colaborador_funcoes enable row level security;
alter table auditoria enable row level security;

revoke all on unidades, perfis, usuario_unidades, funcoes, colaboradores, colaborador_funcoes, auditoria from anon;

drop policy if exists "ver unidades" on unidades;
drop policy if exists "rh altera unidades" on unidades;
create policy "ver unidades" on unidades for select to authenticated using (pode_unidade(id));
create policy "rh altera unidades" on unidades for all to authenticated using (eh_rh()) with check (eh_rh());

drop policy if exists "ver perfil" on perfis;
drop policy if exists "rh altera perfis" on perfis;
create policy "ver perfil" on perfis for select to authenticated using (id = auth.uid() or eh_rh());
create policy "rh altera perfis" on perfis for all to authenticated using (eh_rh()) with check (eh_rh());

drop policy if exists "ver acessos" on usuario_unidades;
drop policy if exists "rh altera acessos" on usuario_unidades;
create policy "ver acessos" on usuario_unidades for select to authenticated using (usuario_id = auth.uid() or eh_rh());
create policy "rh altera acessos" on usuario_unidades for all to authenticated using (eh_rh()) with check (eh_rh());

drop policy if exists "ver funcoes" on funcoes;
drop policy if exists "rh altera funcoes" on funcoes;
create policy "ver funcoes" on funcoes for select to authenticated using (pode_unidade(unidade_id));
create policy "rh altera funcoes" on funcoes for all to authenticated using (eh_rh()) with check (eh_rh());

drop policy if exists "ver colaboradores" on colaboradores;
drop policy if exists "rh altera colaboradores" on colaboradores;
create policy "ver colaboradores" on colaboradores for select to authenticated using (pode_unidade(unidade_id));
create policy "rh altera colaboradores" on colaboradores for all to authenticated using (eh_rh()) with check (eh_rh());

drop policy if exists "ver funcoes do colaborador" on colaborador_funcoes;
drop policy if exists "rh altera funcoes do colaborador" on colaborador_funcoes;
create policy "ver funcoes do colaborador" on colaborador_funcoes for select to authenticated
  using (exists (select 1 from colaboradores c where c.id = colaborador_id and pode_unidade(c.unidade_id)));
create policy "rh altera funcoes do colaborador" on colaborador_funcoes for all to authenticated
  using (eh_rh()) with check (eh_rh());

drop policy if exists "rh ve auditoria" on auditoria;
create policy "rh ve auditoria" on auditoria for select to authenticated using (eh_rh());

-- ---------- Unidades iniciais (editáveis depois pela tela) ----------
insert into unidades (nome) values ('Santos'), ('Praia Grande')
on conflict (nome) do nothing;

-- ---------- Primeiro usuário RH ----------
-- 1) No Supabase: Authentication > Users > Add user (e-mail e senha).
-- 2) Troque o e-mail abaixo pelo seu e rode este bloco UMA vez:
--
-- insert into perfis (id, nome, perfil)
-- select id, 'Seu nome', 'rh' from auth.users where email = 'seu-email@exemplo.com';
