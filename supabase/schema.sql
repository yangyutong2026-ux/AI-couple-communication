-- ============================================================
-- 「之间」数据库结构
--
-- 核心思路：隐私边界不是靠 AI 的提示词守住的，是靠数据库守住的。
-- 对方的日记原文，在数据库这一层就读不到 —— 不是"AI 答应不说"，
-- 是"就算 AI 想说也拿不到"。
-- ============================================================

-- ---------- 1. 用户档案 ----------
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

-- 注册时自动建一条档案
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ---------- 2. 关系（一对） ----------
create table if not exists couples (
  id              uuid primary key default gen_random_uuid(),
  invite_code     text unique not null,
  member_a        uuid not null references profiles(id) on delete cascade,
  member_b        uuid references profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  disconnected_at timestamptz
);

-- 我是不是这一对里的人（security definer 会绕过 RLS，避免策略自己查自己造成死循环）
create or replace function is_member(c uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from couples
    where id = c
      and disconnected_at is null
      and (member_a = auth.uid() or member_b = auth.uid())
  );
$$;

-- 对方是谁
create or replace function partner_of(c uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select case when member_a = auth.uid() then member_b else member_a end
  from couples where id = c;
$$;

-- 用邀请码加入。走这个函数而不是开放查询，
-- 否则任何人都能拿邀请码去数据库里试。
create or replace function join_couple(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from couples
  where invite_code = code and member_b is null and member_a <> auth.uid();

  if cid is null then
    raise exception '邀请码无效，或者这段关系已经有两个人了';
  end if;

  update couples set member_b = auth.uid() where id = cid;
  return cid;
end $$;


-- ---------- 3. 日记：只有作者能读 ----------
create table if not exists diary_entries (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  body        text not null default '',
  mood        text,
  image_path  text,                      -- 存 Storage 的路径；AI 不读图
  ai_readable boolean not null default true,   -- 关掉后连自己的 AI 都不读
  created_at  timestamptz not null default now()
);


-- ---------- 4. 表达风格：AI 抽象出来的那一层 ----------
-- 对方的 AI 只能读到这张表，永远碰不到 diary_entries。
-- "不引用原文"这件事从一句承诺变成了一道墙。
create table if not exists style_profiles (
  user_id       uuid primary key references profiles(id) on delete cascade,
  couple_id     uuid not null references couples(id) on delete cascade,
  summary       text not null default '',   -- 几句话，比如"压力大时倾向沉默而非解释"
  share_enabled boolean not null default true,  -- 关系与隐私里的那个总开关
  updated_at    timestamptz not null default now()
);


-- ---------- 5. 共同沟通 ----------
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  body        text not null,
  ai_assisted boolean not null default false,  -- 用户自己选择要不要标
  created_at  timestamptz not null default now()
);


-- ---------- 6. 与 AI 的私密对话 ----------
create table if not exists ai_messages (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    jsonb not null,   -- 用户：{text}；AI：{observe,you,them,stuck,draft}
  created_at timestamptz not null default now()
);


-- ---------- 7. 文件空间：主动开放出去的东西 ----------
create table if not exists grants (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  owner_id   uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('diary','ai_thread')),
  entry_id   uuid references diary_entries(id) on delete cascade,
  snapshot   jsonb,            -- ai_thread 存快照，之后改动不影响已开放的内容
  is_open    boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists grants_lookup on grants (couple_id, owner_id, is_open);


-- ---------- 8. 已读位置（用来算那个小圆点） ----------
create table if not exists read_state (
  user_id   uuid not null references profiles(id) on delete cascade,
  couple_id uuid not null references couples(id) on delete cascade,
  channel   text not null,     -- 'messages' | 'grants'
  last_seen timestamptz not null default now(),
  primary key (user_id, couple_id, channel)
);


-- ============================================================
-- 访问规则（RLS）
-- 下面每一条都对应产品里的一句承诺。
-- ============================================================
alter table profiles       enable row level security;
alter table couples        enable row level security;
alter table diary_entries  enable row level security;
alter table style_profiles enable row level security;
alter table messages       enable row level security;
alter table ai_messages    enable row level security;
alter table grants         enable row level security;
alter table read_state     enable row level security;

-- 档案：自己，以及自己的另一半
create policy "看得到自己和另一半的档案" on profiles for select
  using (id = auth.uid() or exists (
    select 1 from couples c where c.disconnected_at is null
      and ((c.member_a = auth.uid() and c.member_b = profiles.id)
        or (c.member_b = auth.uid() and c.member_a = profiles.id))));
create policy "只能改自己的档案" on profiles for update
  using (id = auth.uid());

-- 关系
create policy "看得到自己所在的关系" on couples for select
  using (member_a = auth.uid() or member_b = auth.uid());
create policy "只能以自己的身份发起关系" on couples for insert
  with check (member_a = auth.uid());
create policy "关系里的人可以断开" on couples for update
  using (member_a = auth.uid() or member_b = auth.uid());

-- 日记：作者本人，加上"作者主动开放且此刻仍开着"的那几篇。
-- 关掉开关的那一秒，对方的读取权限就没了。
create policy "日记只有作者能读，除非作者主动开放" on diary_entries for select
  using (
    author_id = auth.uid()
    or exists (
      select 1 from grants g
      where g.entry_id = diary_entries.id
        and g.is_open
        and g.owner_id = diary_entries.author_id
        and is_member(g.couple_id)
    )
  );
create policy "只能写自己的日记" on diary_entries for insert
  with check (author_id = auth.uid() and is_member(couple_id));
create policy "只能改自己的日记" on diary_entries for update
  using (author_id = auth.uid());
create policy "只能删自己的日记" on diary_entries for delete
  using (author_id = auth.uid());

-- 表达风格：自己随时能看；对方只有在总开关打开时才读得到
create policy "风格画像：自己或已授权的另一半" on style_profiles for select
  using (
    user_id = auth.uid()
    or (share_enabled and is_member(couple_id) and partner_of(couple_id) = style_profiles.user_id)
  );
create policy "只能改自己的风格画像" on style_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 共同沟通：两个人都能看，但只能以自己的身份发言
create policy "共同沟通双方可见" on messages for select
  using (is_member(couple_id));
create policy "只能以自己的身份发言" on messages for insert
  with check (sender_id = auth.uid() and is_member(couple_id));

-- 与 AI 的对话：只有本人。对方读不到，服务器也不会替对方读。
create policy "与AI的对话只有本人可见" on ai_messages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 文件空间：自己管自己开放的；对方只看得到还开着的
create policy "开放记录：自己全都看得到" on grants for select
  using (owner_id = auth.uid()
      or (is_open and is_member(couple_id) and partner_of(couple_id) = grants.owner_id));
create policy "只能开放自己的东西" on grants for insert
  with check (owner_id = auth.uid() and is_member(couple_id));
create policy "只能开关自己开放的东西" on grants for update
  using (owner_id = auth.uid());
create policy "只能撤回自己开放的东西" on grants for delete
  using (owner_id = auth.uid());

-- 已读位置
create policy "已读位置只属于自己" on read_state for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
