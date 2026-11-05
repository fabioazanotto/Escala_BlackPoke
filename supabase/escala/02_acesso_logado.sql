-- =====================================================================
-- Etapa 1 · parte 2: fecha o acesso aberto das tabelas ANTIGAS
-- (funcionarios, turnos, escalas, regras, configuracoes).
-- Depois deste SQL, só usuários logados e ativos (RH ou gerência) enxergam
-- esses dados. Não apaga nada. Pode rodar mais de uma vez.
-- Rode SOMENTE depois que o login estiver publicado e funcionando.
-- =====================================================================

create or replace function eh_usuario() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

do $$
declare t text;
begin
  foreach t in array array['funcionarios', 'turnos', 'escalas', 'regras', 'configuracoes'] loop
    execute format('drop policy if exists "acesso aberto" on %I', t);
    execute format('drop policy if exists "somente logados" on %I', t);
    execute format('create policy "somente logados" on %I for all to authenticated using (eh_usuario()) with check (eh_usuario())', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
