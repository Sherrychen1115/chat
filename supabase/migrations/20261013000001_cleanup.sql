-- 定時清理:每天刪掉超過 7 天的訊息,以及過期很久的成員登記
-- 用法:貼到 Supabase 後台 SQL Editor 執行,要在 20261013000000_chat.sql 之後。
-- 如果第一行出錯,改用後台左邊選單 Integrations > Cron,把 Cron 啟用,再回來執行第二行以後。

create extension if not exists pg_cron with schema pg_catalog;

-- 同名的排程重複執行時會被更新,不會重複建立
select cron.schedule(
  'chat-cleanup-messages',
  '0 19 * * *',  -- 每天 19:00 (UTC),也就是台灣時間每天 03:00
  $$delete from public.messages where created_at < now() - interval '7 days'$$
);

select cron.schedule(
  'chat-cleanup-members',
  '17 * * * *',  -- 每小時的第 17 分
  $$delete from public.members where last_seen < now() - interval '1 hour'$$
);
