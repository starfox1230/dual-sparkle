-- Multiplayer Quiz Game Database Setup
-- Run this in your Supabase SQL Editor

-- Enable required extensions
create extension if not exists pgcrypto;

-- Create matches table
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  quiz_name text not null,
  quiz jsonb not null,
  host_uid uuid not null,
  status text not null check (status in ('lobby','question_reveal','answering','round_end','finished')),
  current_question_index integer not null default 0,
  phase_start timestamptz not null default now(),
  timer_seconds integer not null default 30,
  round_scored boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- Create players table
create table if not exists players (
  match_id uuid not null references matches(id) on delete cascade,
  uid uuid not null,
  name text not null default 'Player',
  joined_at timestamptz not null default now(),
  ready boolean not null default false,
  score integer not null default 0,
  primary key (match_id, uid)
);

-- Create answers table
create table if not exists answers (
  match_id uuid not null references matches(id) on delete cascade,
  uid uuid not null,
  question_index integer not null,
  choice_index integer not null,
  choice_text text not null,
  is_correct boolean,
  points integer,
  submitted_at timestamptz not null default now(),
  primary key (match_id, uid, question_index),
  foreign key (match_id, uid) references players(match_id, uid) on delete cascade
);

-- Create indexes for better performance
create index if not exists players_match_id_idx on players(match_id);
create index if not exists answers_match_q_idx on answers(match_id, question_index);

-- Trigger to enforce max 2 players per match
create or replace function check_max_two_players() returns trigger as $$
begin
  if (select count(*) from players where match_id = new.match_id) >= 2 then
    raise exception 'Match % already has two players', new.match_id;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_max_two_players
before insert on players
for each row execute function check_max_two_players();

-- Enable Row Level Security
alter table matches enable row level security;
alter table players enable row level security;
alter table answers enable row level security;

-- RLS Policies for matches
create policy read_matches_public_or_member on matches
for select to authenticated
using (
  is_public
  or host_uid = auth.uid()
  or exists(select 1 from players p where p.match_id = id and p.uid = auth.uid())
);

create policy create_match_host_is_creator on matches
for insert to authenticated
with check ( host_uid = auth.uid() );

create policy host_updates_match on matches
for update to authenticated
using ( host_uid = auth.uid() )
with check ( host_uid = auth.uid() );

-- RLS Policies for players
create policy read_players_public_or_member on players
for select to authenticated
using (
  exists (
    select 1 from matches m
    where m.id = match_id
      and (m.is_public or m.host_uid = auth.uid()
           or exists (select 1 from players p2 where p2.match_id = match_id and p2.uid = auth.uid()))
  )
);

create policy self_join_match on players
for insert to authenticated
with check (
  uid = auth.uid()
  and exists (select 1 from matches m where m.id = match_id and m.is_public)
);

create policy self_update_player_ready_name on players
for update to authenticated
using ( uid = auth.uid() )
with check ( uid = auth.uid() );

create policy host_update_player_score on players
for update to authenticated
using ( exists(select 1 from matches m where m.id = match_id and m.host_uid = auth.uid()) )
with check ( true );

-- RLS Policies for answers
create policy read_answers_member on answers
for select to authenticated
using (
  exists (select 1 from players p where p.match_id = match_id and p.uid = auth.uid())
);

create policy upsert_own_answer_for_current_question on answers
for insert to authenticated
with check (
  uid = auth.uid()
  and exists (select 1 from matches m where m.id = match_id and m.status = 'answering' and m.current_question_index = question_index)
);

create policy update_own_answer_during_answering on answers
for update to authenticated
using ( uid = auth.uid() )
with check (
  uid = auth.uid()
  and exists (select 1 from matches m where m.id = match_id and m.status = 'answering' and m.current_question_index = question_index)
);

create policy host_scores_answers on answers
for update to authenticated
using (
  exists (select 1 from matches m where m.id = match_id and m.host_uid = auth.uid() and m.status = 'round_end')
)
with check ( true );

-- RPC function for phase transitions with server timing
create or replace function start_phase(p_match_id uuid, p_status text, p_qindex int default null)
returns void language sql security definer as $$
  update matches
     set status = p_status,
         phase_start = now(),
         current_question_index = coalesce(p_qindex, current_question_index),
         round_scored = false
   where id = p_match_id;
$$;

-- Enable Realtime for all tables
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table answers;