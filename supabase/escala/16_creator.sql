-- =====================================================================
-- Marca o dono do sistema como "creator" (libera a aba "Integração colaboradores").
-- NÃO cria tabela nem altera estrutura: só grava um marcador no cadastro de login do Supabase
-- (app_metadata, que o próprio usuário não consegue editar).
-- Troque COLE_AQUI_SEU_EMAIL pelo e-mail com que você entra no app e rode no SQL Editor.
-- Depois, saia do app e entre de novo para o marcador valer.
-- =====================================================================
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"creator": true}'::jsonb
where email = 'COLE_AQUI_SEU_EMAIL';
-- Deve mostrar "1 row affected". Se mostrar 0, o e-mail não confere.

-- Para tirar o marcador de alguém:
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'creator' where email = '...';
