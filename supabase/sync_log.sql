-- ============================================================
-- TABELA DE LOG DE SINCRONIZAÇÃO LOGONE → TERMINAL
-- Rode no SQL Editor do Supabase
-- ============================================================

create table if not exists public.sync_log (
  id            uuid primary key default uuid_generate_v4(),
  iniciado_em   timestamptz not null default now(),
  concluido_em  timestamptz,
  status        text not null default 'iniciado'
                check (status in ('iniciado','sucesso','erro','parcial')),
  periodo_de    date,
  periodo_ate   date,
  entradas_gravadas  int default 0,
  saidas_gravadas    int default 0,
  registros_duplicados int default 0,
  erro_mensagem  text,
  resposta_raw   text,   -- JSON bruto retornado pelo tgsa-ai (para debug)
  disparado_por  text default 'cron'  -- 'cron' ou 'manual'
);

-- Índice para consultas de histórico
create index if not exists idx_sync_log_iniciado on public.sync_log (iniciado_em desc);

-- RLS — somente admin vê
alter table public.sync_log enable row level security;
create policy "sync_log_admin" on public.sync_log for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- View pública de resumo (sem o campo resposta_raw que é grande)
create or replace view public.vw_sync_resumo as
select
  id,
  iniciado_em,
  concluido_em,
  status,
  periodo_de,
  periodo_ate,
  entradas_gravadas,
  saidas_gravadas,
  registros_duplicados,
  erro_mensagem,
  disparado_por,
  extract(epoch from (concluido_em - iniciado_em))::int as duracao_segundos
from public.sync_log
order by iniciado_em desc;
