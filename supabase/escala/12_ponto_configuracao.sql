-- =====================================================================
-- Ponto (Secullum), Fase 1: configuração. SÓ ESTRUTURA, sem dados.
-- Só acrescenta tabelas novas. Não apaga nada. Pode rodar mais de uma vez.
-- Só o admin enxerga e altera estas tabelas. Nenhum segredo fica aqui:
-- usuário e senha do Secullum ficam só nas variáveis da Vercel.
-- =====================================================================

-- ---------- Banco do Secullum ----------
create table if not exists ponto_bancos (
  id uuid primary key default gen_random_uuid(),
  secullum_id text not null unique,   -- id numérico do banco no Secullum (cabeçalho secullumidbancoselecionado)
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Empresas do Secullum e a que loja/unidade cada uma corresponde ----------
-- incluida = false significa "fora do projeto": o app descarta os dados dessa empresa antes de gravar.
-- unidade_id fica vazio enquanto a unidade ainda não existir no app (ex.: Seu Miyagi e ABC).
-- loja_chave liga a empresa à loja do Xmenu (pg, santos, miyagi, abc), para cruzar vendas e RH depois.
create table if not exists ponto_empresas (
  id uuid primary key default gen_random_uuid(),
  banco_id uuid not null references ponto_bancos (id) on delete cascade,
  secullum_empresa_id int,            -- Id da empresa no Secullum (preenchido na primeira sincronização)
  documento text not null,            -- CNPJ, chave de ligação com o Secullum
  nome text not null,
  loja_chave text references lojas_xmenu (chave),
  unidade_id uuid references unidades (id),
  incluida boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (banco_id, documento)
);
create index if not exists ponto_empresas_unidade_idx on ponto_empresas (unidade_id);

-- ---------- Auditoria ----------
do $$
declare t text;
begin
  foreach t in array array['ponto_bancos', 'ponto_empresas'] loop
    execute format('drop trigger if exists auditar on %I', t);
    execute format('create trigger auditar after insert or update or delete on %I for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

-- ---------- Segurança: só o admin ----------
alter table ponto_bancos enable row level security;
alter table ponto_empresas enable row level security;
revoke all on ponto_bancos, ponto_empresas from anon;

do $$
declare t text;
begin
  foreach t in array array['ponto_bancos', 'ponto_empresas'] loop
    execute format('drop policy if exists "admin" on %I', t);
    execute format('create policy "admin" on %I for all to authenticated using (eh_admin()) with check (eh_admin())', t);
  end loop;
end $$;
