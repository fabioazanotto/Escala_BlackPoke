-- =====================================================================
-- Etapa 1 do app de gestão: perfil "admin".
-- Rode em DUAS partes, uma de cada vez (o Postgres só deixa usar o valor novo
-- do tipo depois que a primeira parte termina).
-- Não apaga dados. Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- PARTE 1 ----------
alter type perfil_acesso add value if not exists 'admin';

-- ---------- PARTE 2 (rode depois da parte 1) ----------
-- create or replace function eh_admin() returns boolean
-- language sql stable security definer set search_path = public as $$
--   select exists (select 1 from perfis where id = auth.uid() and perfil = 'admin' and ativo);
-- $$;
--
-- -- Admin vale como RH em todas as regras de acesso que já usam eh_rh().
-- create or replace function eh_rh() returns boolean
-- language sql stable security definer set search_path = public as $$
--   select exists (select 1 from perfis where id = auth.uid() and perfil in ('rh', 'admin') and ativo);
-- $$;
--
-- -- Só o admin cria ou altera admins. O RH continua gerenciando os demais perfis.
-- drop policy if exists "rh altera perfis" on perfis;
-- drop policy if exists "admin altera perfis" on perfis;
-- drop policy if exists "rh altera perfis comuns" on perfis;
-- create policy "admin altera perfis" on perfis for all to authenticated
--   using (eh_admin()) with check (eh_admin());
-- create policy "rh altera perfis comuns" on perfis for all to authenticated
--   using (eh_rh() and perfil <> 'admin') with check (eh_rh() and perfil <> 'admin');

-- ---------- PARTE 3: tornar um usuário admin ----------
-- update perfis set perfil = 'admin' where id = (select id from auth.users where email = 'email@exemplo.com');
