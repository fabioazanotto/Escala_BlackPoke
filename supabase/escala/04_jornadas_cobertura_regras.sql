-- =====================================================================
-- Etapa 3: jornadas, horário de funcionamento, cobertura, ausências,
-- parâmetros (operacionais e trabalhistas) e feriados.
-- Só acrescenta tabelas novas. Não apaga nada. Pode rodar mais de uma vez.
-- Nenhuma regra trabalhista entra como verdade: os valores legais ficam
-- em branco e "não validados" até você confirmar com contador/convenção.
-- =====================================================================

-- ---------- Jornadas dos colaboradores (por unidade e turno fixo) ----------
-- Se hora_fim <= hora_inicio, a jornada termina no dia seguinte (ex.: 16:00 às 00:20).
create table if not exists jornadas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades (id) on delete cascade,
  turno text not null check (turno in ('dia', 'noite')),
  hora_inicio time not null,
  hora_fim time not null,
  intervalo_minutos int not null default 60 check (intervalo_minutos >= 0),
  unique (unidade_id, turno)
);

-- ---------- Horário de atendimento ao público e delivery ----------
create table if not exists funcionamento (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades (id) on delete cascade,
  nome text not null,
  hora_inicio time not null,
  hora_fim time not null,
  dias_semana smallint[] not null default '{0,1,2,3,4,5,6}', -- 0 = domingo ... 6 = sábado
  unique (unidade_id, nome)
);

-- ---------- Cobertura: ideal e mínima reduzida ----------
-- dia_semana nulo = vale para todos os dias. minimo_reduzido nulo = igual ao ideal.
create table if not exists cobertura (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades (id) on delete cascade,
  turno text not null check (turno in ('dia', 'noite')),
  funcao_id uuid not null references funcoes (id) on delete cascade,
  dia_semana smallint check (dia_semana between 0 and 6),
  ideal int not null check (ideal >= 0),
  minimo_reduzido int check (minimo_reduzido >= 0),
  check (minimo_reduzido is null or minimo_reduzido <= ideal)
);
create unique index if not exists cobertura_unica
  on cobertura (unidade_id, turno, funcao_id, coalesce(dia_semana, -1));

-- ---------- Ausências: férias, afastamentos e indisponibilidades ----------
create table if not exists ausencias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores (id) on delete cascade,
  tipo text not null check (tipo in ('ferias', 'afastamento', 'indisponibilidade')),
  data_inicio date not null,
  data_fim date not null,
  motivo text,
  criado_em timestamptz not null default now(),
  check (data_fim >= data_inicio)
);
create index if not exists ausencias_colab_idx on ausencias (colaborador_id, data_inicio);

-- ---------- Parâmetros (regras operacionais e trabalhistas configuráveis) ----------
-- unidade_id nulo = vale para todas as unidades.
create table if not exists parametros (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references unidades (id) on delete cascade,
  tipo text not null check (tipo in ('operacional', 'legal')),
  chave text not null,
  descricao text not null,
  valor text,
  fonte text,
  validado boolean not null default false,
  observacao text
);
create unique index if not exists parametros_unico
  on parametros (chave, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- Feriados ----------
create table if not exists feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  nome text not null,
  unidade_id uuid references unidades (id) on delete cascade -- nulo = todas
);
create unique index if not exists feriados_unico
  on feriados (data, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- Auditoria ----------
do $$
declare t text;
begin
  foreach t in array array['jornadas', 'funcionamento', 'cobertura', 'ausencias', 'parametros', 'feriados'] loop
    execute format('drop trigger if exists auditar on %I', t);
    execute format('create trigger auditar after insert or update or delete on %I for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

-- ---------- Segurança ----------
alter table jornadas enable row level security;
alter table funcionamento enable row level security;
alter table cobertura enable row level security;
alter table ausencias enable row level security;
alter table parametros enable row level security;
alter table feriados enable row level security;
revoke all on jornadas, funcionamento, cobertura, ausencias, parametros, feriados from anon;

do $$
declare t text;
begin
  foreach t in array array['jornadas', 'funcionamento', 'cobertura'] loop
    execute format('drop policy if exists "ver" on %I', t);
    execute format('drop policy if exists "rh altera" on %I', t);
    execute format('create policy "ver" on %I for select to authenticated using (pode_unidade(unidade_id))', t);
    execute format('create policy "rh altera" on %I for all to authenticated using (eh_rh()) with check (eh_rh())', t);
  end loop;
  foreach t in array array['parametros', 'feriados'] loop
    execute format('drop policy if exists "ver" on %I', t);
    execute format('drop policy if exists "rh altera" on %I', t);
    execute format('create policy "ver" on %I for select to authenticated using (unidade_id is null and eh_usuario() or unidade_id is not null and pode_unidade(unidade_id))', t);
    execute format('create policy "rh altera" on %I for all to authenticated using (eh_rh()) with check (eh_rh())', t);
  end loop;
end $$;

drop policy if exists "ver" on ausencias;
drop policy if exists "rh altera" on ausencias;
create policy "ver" on ausencias for select to authenticated
  using (exists (select 1 from colaboradores c where c.id = colaborador_id and pode_unidade(c.unidade_id)));
create policy "rh altera" on ausencias for all to authenticated using (eh_rh()) with check (eh_rh());

-- ---------- Valores iniciais (só o que você informou) ----------
insert into jornadas (unidade_id, turno, hora_inicio, hora_fim, intervalo_minutos)
select u.id, t.turno, t.ini::time, t.fim::time, 60
from unidades u
cross join (values ('dia', '09:00', '17:20'), ('noite', '16:00', '00:20')) as t (turno, ini, fim)
on conflict (unidade_id, turno) do nothing;

insert into funcionamento (unidade_id, nome, hora_inicio, hora_fim)
select u.id, f.nome, f.ini::time, f.fim::time
from unidades u
cross join (values ('Almoço', '11:00', '15:00'), ('Jantar', '18:00', '23:30')) as f (nome, ini, fim)
on conflict (unidade_id, nome) do nothing;

-- Cobertura ideal = dimensionamento informado. Mínima reduzida fica em branco (você define).
insert into cobertura (unidade_id, turno, funcao_id, ideal)
select u.id, d.turno, f.id, d.qtd
from (values
  ('Santos', 'dia',   'Operador de caixa',     null,         1),
  ('Santos', 'dia',   'Auxiliar de expedição', null,         1),
  ('Santos', 'dia',   'Sushiman',              'Seu Miyagi', 1),
  ('Santos', 'dia',   'Cozinheiro',            'Seu Miyagi', 1),
  ('Santos', 'dia',   'Ajudante de cozinha',   null,         2),
  ('Santos', 'noite', 'Operador de caixa',     null,         1),
  ('Santos', 'noite', 'Auxiliar de expedição', null,         1),
  ('Santos', 'noite', 'Sushiman',              'Seu Miyagi', 1),
  ('Santos', 'noite', 'Cozinheiro',            'Seu Miyagi', 1),
  ('Santos', 'noite', 'Ajudante de cozinha',   null,         2),
  ('Santos', 'noite', 'Cozinheiro',            'BlackPoke',  1),
  ('Praia Grande', 'dia',   'Operador de caixa',     null,        1),
  ('Praia Grande', 'dia',   'Ajudante de cozinha',   null,        2),
  ('Praia Grande', 'noite', 'Operador de caixa',     null,        1),
  ('Praia Grande', 'noite', 'Auxiliar de expedição', null,        1),
  ('Praia Grande', 'noite', 'Cozinheiro',            'BlackPoke', 1),
  ('Praia Grande', 'noite', 'Ajudante de cozinha',   null,        2)
) as d (unidade, turno, funcao, operacao, qtd)
join unidades u on u.nome = d.unidade
join funcoes f on f.unidade_id = u.id and f.nome = d.funcao and coalesce(f.operacao, '') = coalesce(d.operacao, '')
on conflict do nothing;

-- Regras operacionais informadas (não são exigências legais).
insert into parametros (tipo, chave, descricao, valor, fonte, validado) values
  ('operacional', 'dias_folga_semanal', 'Dias da semana preferidos para a folga semanal (0 = domingo ... 6 = sábado)', '1,2,3', 'Política da empresa', true),
  ('operacional', 'domingos_descanso_por_mes', 'Domingos de descanso adicionais por colaborador por mês', '1', 'Política da empresa', true),
  ('operacional', 'abrir_e_fechar_mesmo_dia', 'Permitir o mesmo colaborador abrir e fechar no mesmo dia (sim/nao)', 'nao', 'Política da empresa', true),
  ('operacional', 'usar_folguistas_externos', 'Usar folguistas ou colaboradores externos (sim/nao)', 'nao', 'Política da empresa', true)
on conflict do nothing;

-- Exigências legais: valores em branco até serem validados (contador / convenção coletiva).
insert into parametros (tipo, chave, descricao, valor, fonte, validado, observacao) values
  ('legal', 'descanso_entre_jornadas_horas', 'Descanso mínimo entre o fim de uma jornada e o início da seguinte (horas)', null, null, false, 'A definir com contador/convenção coletiva'),
  ('legal', 'jornada_maxima_diaria_horas', 'Jornada máxima por dia, incluindo horas extras (horas)', null, null, false, 'A definir com contador/convenção coletiva'),
  ('legal', 'jornada_semanal_horas', 'Jornada semanal máxima (horas)', null, null, false, 'A definir com contador/convenção coletiva'),
  ('legal', 'dias_consecutivos_maximos', 'Máximo de dias seguidos de trabalho', null, null, false, 'A definir com contador/convenção coletiva'),
  ('legal', 'descanso_semanal_horas', 'Descanso semanal remunerado mínimo (horas)', null, null, false, 'A definir com contador/convenção coletiva'),
  ('legal', 'domingo_de_descanso_periodicidade', 'A cada quantas semanas o descanso deve cair num domingo', null, null, false, 'A regra de 1 domingo por mês não é presumida como suficiente'),
  ('legal', 'adicional_noturno', 'Regras de adicional e hora reduzida noturna', null, null, false, 'A definir com contador/convenção coletiva')
on conflict do nothing;
