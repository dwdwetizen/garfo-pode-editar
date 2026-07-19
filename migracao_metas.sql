-- Rode isso no Supabase → SQL Editor (uma vez só).
-- Adiciona os campos de meta em cada colaborador, sem afetar nada que já existe.

alter table profiles add column if not exists meta_faturamento numeric default 5000;
alter table profiles add column if not exists ticket_medio numeric default 497;
alter table profiles add column if not exists conv_ligacao_contato numeric default 0.20; -- 20%
alter table profiles add column if not exists conv_contato_reuniao numeric default 0.15; -- 15%
alter table profiles add column if not exists conv_reuniao_fechamento numeric default 0.25; -- 25%
alter table profiles add column if not exists dias_uteis_semana integer default 6;
