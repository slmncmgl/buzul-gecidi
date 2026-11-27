-- Buzul Geçidi — Supabase şeması (src/cloud.js ile birlikte çalışır)
-- Supabase → SQL Editor'a yapıştır → Run. İdempotent: tekrar çalıştırmak zararsızdır.
-- Erişim modeli: herkes (anon + authenticated) skor tablolarını OKUR; kullanıcı yalnız kendi satırını yazar.

-- ============================================================ tablolar
-- Profil: görünen ad (Google adı, en çok 20 karakter; kullanıcı sonra değiştirebilir)
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Pilot' check (char_length(display_name) between 1 and 20),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Kayıt: oyuncunun ilerlemesi tek JSON sütununda (istemci birleştirme politikasını uygular)
create table if not exists public.saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 262144),  -- 256 KB üst sınır
  updated_at timestamptz not null default now()
);

-- Skorlar: her oyun bir satır; sunucu hepsini saklar
create table if not exists public.scores (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  score      integer not null check (score >= 0),
  stage      integer not null default 0 check (stage between 0 and 9999),
  ship       integer not null default 0 check (ship between 0 and 999),
  pilot      integer not null default 0 check (pilot between 0 and 999),
  won        boolean not null default false,
  created_at timestamptz not null default now()
);

-- En iyi: kullanıcı başına tek satır, scores tetikleyicisi günceller (tüm zamanlar tablosu buradan okunur)
create table if not exists public.best (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  score      integer not null check (score >= 0),
  stage      integer not null default 0,
  ship       integer not null default 0,
  pilot      integer not null default 0,
  won        boolean not null default false,
  created_at timestamptz not null default now()      -- rekorun kırıldığı an
);

-- Günlük görev skoru: (kullanıcı, gün) başına tek satır; tetikleyici küçük skorun büyüğü ezmesini engeller
create table if not exists public.daily_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  score      integer not null check (score >= 0),
  stage      integer not null default 0 check (stage between 0 and 9999),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ============================================================ indeksler (skor tabloları için)
create index if not exists scores_user_created_idx on public.scores (user_id, created_at desc);
create index if not exists scores_created_score_idx on public.scores (created_at desc, score desc);   -- haftalık tablo
create index if not exists best_score_idx on public.best (score desc, created_at asc);                -- tüm zamanlar
create index if not exists daily_scores_day_score_idx on public.daily_scores (day, score desc);

-- ============================================================ tetikleyiciler
-- 1) İlk girişte profil satırı: auth.users'a eklenen her kullanıcı için Google adından display_name
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''),
    nullif(split_part(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ' ', 1), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pilot'
  );
  v_name := regexp_replace(v_name, '[[:cntrl:]<>"''`\\]', '', 'g');
  v_name := left(trim(v_name), 20);
  if v_name = '' then v_name := 'Pilot'; end if;
  insert into public.profiles (user_id, display_name) values (new.id, v_name)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) scores'a eklenen her satır → best tablosunda kullanıcının rekorunu güncelle (sadece büyükse)
create or replace function public.scores_upsert_best()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.best (user_id, score, stage, ship, pilot, won, created_at)
  values (new.user_id, new.score, new.stage, new.ship, new.pilot, new.won, new.created_at)
  on conflict (user_id) do update
    set score = excluded.score, stage = excluded.stage, ship = excluded.ship,
        pilot = excluded.pilot, won = excluded.won, created_at = excluded.created_at
    where excluded.score > public.best.score;
  return new;
end;
$$;

drop trigger if exists scores_after_insert on public.scores;
create trigger scores_after_insert
  after insert on public.scores
  for each row execute function public.scores_upsert_best();

-- 3) daily_scores: upsert ile gelen küçük skor mevcut büyüğü ezmesin (keep max)
create or replace function public.daily_keep_max()
returns trigger
language plpgsql
as $$
begin
  if new.score < old.score then
    new.score := old.score;
    new.stage := old.stage;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists daily_scores_before_update on public.daily_scores;
create trigger daily_scores_before_update
  before update on public.daily_scores
  for each row execute function public.daily_keep_max();

-- 4) profiles/saves updated_at damgası + display_name temizliği
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.touch_updated_at();

create or replace function public.profiles_clean()
returns trigger
language plpgsql
as $$
begin
  new.display_name := left(trim(regexp_replace(coalesce(new.display_name, ''), '[[:cntrl:]<>"''`\\]', '', 'g')), 20);
  if new.display_name = '' then new.display_name := 'Pilot'; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_clean_tr on public.profiles;
create trigger profiles_clean_tr before insert or update on public.profiles
  for each row execute function public.profiles_clean();

-- ============================================================ görünümler (skor tabloları)
-- Görünümler sahibinin (postgres) yetkisiyle çalışır (security_invoker kapalı): böylece anon kullanıcı
-- profiles RLS'sine takılmadan herkesin adını ve skorunu görür. Yalnız display_name dışa çıkar, e-posta yok.
create or replace view public.lb_all as
  select row_number() over (order by b.score desc, b.created_at asc)::int as rank,
         b.user_id,
         coalesce(p.display_name, 'Pilot') as name,
         b.score, b.stage, b.ship, b.pilot, b.won, b.created_at
  from public.best b
  left join public.profiles p on p.user_id = b.user_id
  order by b.score desc, b.created_at asc
  limit 100;

create or replace view public.lb_week as
  with wk as (
    select distinct on (s.user_id) s.user_id, s.score, s.stage, s.ship, s.pilot, s.won, s.created_at
    from public.scores s
    where s.created_at >= date_trunc('week', now())
    order by s.user_id, s.score desc, s.created_at asc
  )
  select row_number() over (order by wk.score desc, wk.created_at asc)::int as rank,
         wk.user_id,
         coalesce(p.display_name, 'Pilot') as name,
         wk.score, wk.stage, wk.ship, wk.pilot, wk.won, wk.created_at
  from wk
  left join public.profiles p on p.user_id = wk.user_id
  order by wk.score desc, wk.created_at asc
  limit 100;

alter view public.lb_all  set (security_invoker = false);
alter view public.lb_week set (security_invoker = false);

-- Günlük tablo: fonksiyon (gün parametreli). Herkes çağırabilir, yalnız ad + skor döner.
create or replace function public.lb_daily(p_day date, p_limit int default 50)
returns table (rank int, user_id uuid, name text, score int, stage int)
language sql
security definer
stable
set search_path = public
as $$
  select row_number() over (order by d.score desc, d.updated_at asc)::int as rank,
         d.user_id,
         coalesce(p.display_name, 'Pilot') as name,
         d.score, d.stage
  from public.daily_scores d
  left join public.profiles p on p.user_id = d.user_id
  where d.day = p_day
  order by d.score desc, d.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

-- Kendi sıram (ilk 100'de değilsem): 'all' → best, 'week' → bu haftaki en iyi skorum
create or replace function public.my_rank(p_kind text default 'all')
returns table (rank int, score int)
language sql
security definer
stable
set search_path = public
as $$
  with mine as (
    select case when p_kind = 'week'
             then (select max(s.score) from public.scores s where s.user_id = auth.uid() and s.created_at >= date_trunc('week', now()))
             else (select b.score from public.best b where b.user_id = auth.uid())
           end as score
  )
  select case when mine.score is null then 0
              when p_kind = 'week' then
                (select count(*)::int + 1 from (
                   select s.user_id, max(s.score) as sc from public.scores s
                   where s.created_at >= date_trunc('week', now()) and s.user_id <> auth.uid()
                   group by s.user_id) w where w.sc > mine.score)
              else (select count(*)::int + 1 from public.best b where b.score > mine.score and b.user_id <> auth.uid())
         end as rank,
         mine.score
  from mine;
$$;

-- ============================================================ RLS
alter table public.profiles     enable row level security;
alter table public.saves        enable row level security;
alter table public.scores       enable row level security;
alter table public.best         enable row level security;
alter table public.daily_scores enable row level security;

-- profiles: sadece kendi satırı (okuma/ekleme/güncelleme)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = user_id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- saves: sadece kendi satırı
drop policy if exists saves_select_own on public.saves;
create policy saves_select_own on public.saves for select to authenticated using (auth.uid() = user_id);
drop policy if exists saves_insert_own on public.saves;
create policy saves_insert_own on public.saves for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists saves_update_own on public.saves;
create policy saves_update_own on public.saves for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- scores: kendi adına ekleme; okuma yalnız kendi satırları (tablolar görünümlerden okunur)
drop policy if exists scores_insert_own on public.scores;
create policy scores_insert_own on public.scores for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists scores_select_own on public.scores;
create policy scores_select_own on public.scores for select to authenticated using (auth.uid() = user_id);

-- best: istemci yazmaz (tetikleyici security definer ile yazar); kendi satırını okuyabilir
drop policy if exists best_select_own on public.best;
create policy best_select_own on public.best for select to authenticated using (auth.uid() = user_id);

-- daily_scores: sadece kendi satırı
drop policy if exists daily_select_own on public.daily_scores;
create policy daily_select_own on public.daily_scores for select to authenticated using (auth.uid() = user_id);
drop policy if exists daily_insert_own on public.daily_scores;
create policy daily_insert_own on public.daily_scores for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists daily_update_own on public.daily_scores;
create policy daily_update_own on public.daily_scores for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================ yetkiler
-- Tablolara doğrudan yetki: RLS üstüne. anon'a tablo yetkisi yok; anon yalnız görünüm/fonksiyonları kullanır.
revoke all on public.profiles, public.saves, public.scores, public.best, public.daily_scores from anon;
grant select, insert, update on public.profiles     to authenticated;
grant select, insert, update on public.saves        to authenticated;
grant select, insert         on public.scores       to authenticated;
grant select                 on public.best         to authenticated;
grant select, insert, update on public.daily_scores to authenticated;
grant usage, select on sequence public.scores_id_seq to authenticated;

grant select on public.lb_all, public.lb_week to anon, authenticated;
grant execute on function public.lb_daily(date, int) to anon, authenticated;
grant execute on function public.my_rank(text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.scores_upsert_best() from public, anon, authenticated;

-- Not: PostgREST şema önbelleği birkaç saniyede yenilenir; gerekirse: notify pgrst, 'reload schema';
notify pgrst, 'reload schema';
