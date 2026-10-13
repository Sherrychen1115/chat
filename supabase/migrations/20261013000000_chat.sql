-- 匿名聊天室:資料表、規則、權限、即時推送
-- 用法:貼到 Supabase 後台 SQL Editor 執行。可以重複執行,不會重複建立或弄壞資料。
-- 規則的說明見 docs/architecture.md 第 3.3、3.5、9.1 節。

-- ============================================================
-- 1. 資料表
-- ============================================================

-- 成員表:記錄「哪個代號屬於哪個匿名身分」。唯一性檢查在這裡。
create table if not exists public.members (
  user_id   uuid primary key,
  nickname  text not null
            check (char_length(nickname) between 1 and 12 and nickname = btrim(nickname)),
  last_seen timestamptz not null default now()
);

-- 代號不分大小寫,不可重複
create unique index if not exists members_nickname_key on public.members (lower(nickname));

-- 訊息表
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  nickname   text not null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- 限速要常常查「這個人最近 3 秒送了幾則」
create index if not exists messages_user_created_idx on public.messages (user_id, created_at desc);

-- ============================================================
-- 2. 權限:瀏覽器不能直接新增、修改、刪除任何東西
-- ============================================================

alter table public.members  enable row level security;
alter table public.messages enable row level security;

revoke all on public.members  from anon, authenticated;
revoke all on public.messages from anon, authenticated;

-- 訊息只開放「讀取」,而且只有登入過(包含匿名登入)的人能讀
grant select on public.messages to authenticated;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select to authenticated
  using (true);

-- members 沒有任何 policy,瀏覽器完全碰不到,只能透過下面的函式

-- ============================================================
-- 3. 函式(瀏覽器只能照這幾個固定流程操作)
-- 錯誤用固定代碼回報:nickname_taken、nickname_invalid、
-- body_invalid、rate_limited、not_member,前端轉成中文。
-- ============================================================

-- 3.1 登記代號、進入聊天室
create or replace function public.claim_nickname(p_nickname text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_nick text;
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;

  -- 清理代號:長得像空白的字元換成一般空白、拿掉不可見和控制字元、
  -- 連續空白合併成一個、去掉前後空白
  v_nick := coalesce(p_nickname, '');
  v_nick := regexp_replace(v_nick, '[   -   　]', ' ', 'g');
  v_nick := regexp_replace(v_nick, '[\u0001-\u001F\u007F-\u009F­ᅟᅠ​-‏‪-‮⁠-⁤⁦-⁩ㅤ﻿]', '', 'g');
  v_nick := regexp_replace(v_nick, ' {2,}', ' ', 'g');
  v_nick := btrim(v_nick, ' ');

  if char_length(v_nick) < 1
     or char_length(v_nick) > 12
     or lower(v_nick) in ('系統', 'system') then
    raise exception 'nickname_invalid';
  end if;

  -- 先清掉超過 3 分鐘沒有動靜的舊登記(代號自動釋放)
  delete from public.members where last_seen < now() - interval '3 minutes';

  begin
    insert into public.members (user_id, nickname, last_seen)
    values (v_uid, v_nick, now())
    on conflict (user_id) do update
      set nickname = excluded.nickname, last_seen = now();
  exception when unique_violation then
    -- 同一瞬間或之前已經有別人用了這個代號
    raise exception 'nickname_taken';
  end;

  return v_nick;
end;
$$;

-- 3.2 報到(心跳):前端每 30 秒呼叫一次,保住代號
create or replace function public.touch_nickname()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members set last_seen = now() where user_id = auth.uid();
  if not found then
    raise exception 'not_member';
  end if;
end;
$$;

-- 3.3 離開:立刻釋放代號
create or replace function public.release_nickname()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.members where user_id = auth.uid();
end;
$$;

-- 3.4 送出訊息:代號和時間由資料庫決定,不接受前端傳來的
create or replace function public.send_message(p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_nick   text;
  v_body   text;
  v_recent integer;
  v_id     bigint;
begin
  if v_uid is null then
    raise exception 'not_member';
  end if;

  -- 同一個人的請求排隊處理,限速計算才不會被同時送出的請求鑽漏洞
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- 必須是成員,而且 3 分鐘內有報到過
  select nickname into v_nick
    from public.members
   where user_id = v_uid and last_seen >= now() - interval '3 minutes';
  if v_nick is null then
    raise exception 'not_member';
  end if;

  -- 清理內容:統一換行、長得像空白的字元換成一般空白、拿掉控制字元(保留換行)、
  -- 連續空行最多留一行、去掉前後空白
  v_body := coalesce(p_body, '');
  v_body := regexp_replace(v_body, E'\r\n?', E'\n', 'g');
  v_body := regexp_replace(v_body, '[   -   　]', ' ', 'g');
  v_body := regexp_replace(v_body, '[\u0001-\u0009\u000B-\u001F\u007F-\u009F­​‌‎‏‪-‮⁠-⁤⁦-⁩﻿]', '', 'g');
  v_body := regexp_replace(v_body, E'\n{3,}', E'\n\n', 'g');
  v_body := btrim(v_body, E' \n\t');

  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'body_invalid';
  end if;

  -- 限速:3 秒內最多 5 則
  select count(*) into v_recent
    from public.messages
   where user_id = v_uid and created_at > now() - interval '3 seconds';
  if v_recent >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into public.messages (user_id, nickname, body)
  values (v_uid, v_nick, v_body)
  returning id into v_id;

  update public.members set last_seen = now() where user_id = v_uid;

  return v_id;
end;
$$;

-- 只有登入過(包含匿名登入)的人能呼叫這四個函式
revoke all on function public.claim_nickname(text)   from public, anon;
revoke all on function public.touch_nickname()       from public, anon;
revoke all on function public.release_nickname()     from public, anon;
revoke all on function public.send_message(text)     from public, anon;
grant execute on function public.claim_nickname(text) to authenticated;
grant execute on function public.touch_nickname()     to authenticated;
grant execute on function public.release_nickname()   to authenticated;
grant execute on function public.send_message(text)   to authenticated;

-- ============================================================
-- 4. 即時推送:訊息表一有新增,就推給所有正在看的人
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
