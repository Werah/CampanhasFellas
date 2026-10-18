-- =====================================================================
-- CampanhasFellas - estrutura do banco no Supabase
-- Cole tudo no "SQL Editor" do Supabase e clique em "Run".
-- Pode rodar de novo sem problema (não apaga dados).
-- =====================================================================

-- Só o usuário do grupo pode ler e gravar.
-- Se você criar o usuário do grupo com outro e-mail, troque aqui E em js/config.js.
create or replace function public.eh_do_grupo()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'fellas@fellas.com'
$$;

-- "Hoje" no horário de Brasília (o servidor do Supabase usa UTC)
create or replace function public.hoje()
returns date
language sql stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- ---------- Tabelas ----------

create table if not exists public.fellas (
  id          text primary key default gen_random_uuid()::text,
  nick        text not null check (length(trim(nick)) > 0),
  observacoes text not null default ''
);

create table if not exists public.campanhas (
  id         text primary key default gen_random_uuid()::text,
  nome       text not null check (length(trim(nome)) > 0),
  sistema    text not null default '',
  mestre_id  text not null default '',
  jogadores  text[] not null default '{}',
  status     text not null default 'ativa' check (status in ('ativa', 'inativa')),
  cor        text not null default '#8b5cf6',
  descricao  text not null default '',
  imagem     text not null default ''
);

create table if not exists public.sessoes (
  id           text primary key default gen_random_uuid()::text,
  campanha_id  text not null references public.campanhas(id) on delete cascade,
  data         date not null,
  hora         text not null default '',
  notas        text not null default '',
  resumo       text not null default '',
  serie_id     text not null default ''
);

create table if not exists public.personagens (
  id           text primary key default gen_random_uuid()::text,
  campanha_id  text not null references public.campanhas(id) on delete cascade,
  nome         text not null check (length(trim(nome)) > 0),
  fella_id     text not null default '',
  classe       text not null default '',
  descricao    text not null default '',
  imagem       text not null default ''
);

create table if not exists public.itens (
  id           text primary key default gen_random_uuid()::text,
  campanha_id  text not null references public.campanhas(id) on delete cascade,
  nome         text not null check (length(trim(nome)) > 0),
  quantidade   integer not null default 1 check (quantidade >= 0),
  descricao    text not null default ''
);

create index if not exists sessoes_campanha on public.sessoes (campanha_id, data);
create index if not exists sessoes_serie on public.sessoes (serie_id);
create index if not exists personagens_campanha on public.personagens (campanha_id);
create index if not exists itens_campanha on public.itens (campanha_id);

-- Campanhas com a contagem de sessões (uma sessão conta como "jogada" quando a data dela já chegou)
create or replace view public.campanhas_com_contagem
with (security_invoker = true) as
select
  c.*,
  (select count(*) from public.sessoes s where s.campanha_id = c.id and s.data <= public.hoje())::int as sessoes_jogadas,
  (select count(*) from public.sessoes s where s.campanha_id = c.id)::int as sessoes_total
from public.campanhas c;

-- ---------- Regras ----------

-- Campanha que já teve sessão jogada não pode ser excluída
create or replace function public.impedir_excluir_campanha_jogada()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.sessoes where campanha_id = old.id and data <= public.hoje()) then
    raise exception 'Essa campanha já teve sessões, não pode ser excluída. Marque como inativa.';
  end if;
  return old;
end
$$;

drop trigger if exists impedir_excluir_campanha_jogada on public.campanhas;
create trigger impedir_excluir_campanha_jogada
  before delete on public.campanhas
  for each row execute function public.impedir_excluir_campanha_jogada();

-- Excluir um fella tira ele das campanhas e dos personagens
create or replace function public.limpar_fella_excluido()
returns trigger
language plpgsql
as $$
begin
  update public.campanhas set mestre_id = '' where mestre_id = old.id;
  update public.campanhas set jogadores = array_remove(jogadores, old.id) where old.id = any(jogadores);
  update public.personagens set fella_id = '' where fella_id = old.id;
  return old;
end
$$;

drop trigger if exists limpar_fella_excluido on public.fellas;
create trigger limpar_fella_excluido
  after delete on public.fellas
  for each row execute function public.limpar_fella_excluido();

-- ---------- Segurança (Row Level Security) ----------

alter table public.fellas      enable row level security;
alter table public.campanhas   enable row level security;
alter table public.sessoes     enable row level security;
alter table public.personagens enable row level security;
alter table public.itens       enable row level security;

drop policy if exists grupo on public.fellas;
drop policy if exists grupo on public.campanhas;
drop policy if exists grupo on public.sessoes;
drop policy if exists grupo on public.personagens;
drop policy if exists grupo on public.itens;

create policy grupo on public.fellas      for all to authenticated using (public.eh_do_grupo()) with check (public.eh_do_grupo());
create policy grupo on public.campanhas   for all to authenticated using (public.eh_do_grupo()) with check (public.eh_do_grupo());
create policy grupo on public.sessoes     for all to authenticated using (public.eh_do_grupo()) with check (public.eh_do_grupo());
create policy grupo on public.personagens for all to authenticated using (public.eh_do_grupo()) with check (public.eh_do_grupo());
create policy grupo on public.itens       for all to authenticated using (public.eh_do_grupo()) with check (public.eh_do_grupo());

grant select, insert, update, delete on public.fellas, public.campanhas, public.sessoes, public.personagens, public.itens to authenticated;
grant select on public.campanhas_com_contagem to authenticated;
revoke all on public.fellas, public.campanhas, public.sessoes, public.personagens, public.itens, public.campanhas_com_contagem from anon;

-- ---------- Imagens (Storage) ----------

-- Bucket público: qualquer um com o link exato vê a imagem; só o grupo envia e apaga
insert into storage.buckets (id, name, public)
values ('imagens', 'imagens', true)
on conflict (id) do nothing;

drop policy if exists "grupo le imagens" on storage.objects;
drop policy if exists "grupo envia imagens" on storage.objects;
drop policy if exists "grupo apaga imagens" on storage.objects;

create policy "grupo le imagens" on storage.objects
  for select to authenticated using (bucket_id = 'imagens' and public.eh_do_grupo());
create policy "grupo envia imagens" on storage.objects
  for insert to authenticated with check (bucket_id = 'imagens' and public.eh_do_grupo());
create policy "grupo apaga imagens" on storage.objects
  for delete to authenticated using (bucket_id = 'imagens' and public.eh_do_grupo());

-- ---------- Manter o projeto acordado ----------

-- Função simples chamada pelo GitHub Actions a cada poucos dias,
-- para o plano grátis do Supabase não pausar o projeto por falta de uso.
create or replace function public.ping()
returns text
language sql stable
as $$ select 'pong'::text $$;

grant execute on function public.ping() to anon;
