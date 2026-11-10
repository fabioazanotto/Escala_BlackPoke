-- =====================================================================
-- Agendador das vendas: o próprio Supabase chama o app em intervalos fixos.
-- Pode rodar mais de uma vez. O segredo NUNCA fica neste arquivo.
--
-- PASSO A (só você faz, no SQL Editor): guarda o segredo no cofre do Supabase (Vault).
-- Troque COLE_AQUI pelo mesmo valor que você pôs em SINCRONIZAR_SEGREDO na Vercel,
-- mantendo as aspas. Rode UMA vez e depois apague o texto do editor.
--
--   select vault.create_secret('COLE_AQUI', 'sincronizar_segredo');
--
-- (para trocar depois: select vault.update_secret(id, 'NOVO') from vault.secrets where name = 'sincronizar_segredo';)
--
-- PASSO B (o resto, que o Claude roda): extensões e tarefas agendadas.
-- Se o endereço do app mudar (ex.: blackpoke-gestao.vercel.app), rode o PASSO B de novo com o endereço novo.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Tarefa 1: a cada 10 minutos, atualiza hoje e os 2 dias anteriores.
select cron.unschedule(jobid) from cron.job where jobname = 'vendas-recentes';
select cron.schedule('vendas-recentes', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://escala-black-poke.vercel.app/api/vendas/sincronizar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sincronizar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'sincronizar_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

-- Tarefa 2: a cada 5 minutos (nos minutos 3, 8, 13...), completa o histórico aos poucos.
-- Quando o histórico estiver completo, a rota só confere e não consulta o Xmenu.
select cron.unschedule(jobid) from cron.job where jobname = 'vendas-historico';
select cron.schedule('vendas-historico', '3-59/5 * * * *', $job$
  select net.http_post(
    url := 'https://escala-black-poke.vercel.app/api/vendas/sincronizar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sincronizar-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'sincronizar_segredo')
    ),
    body := '{"historico": true}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
