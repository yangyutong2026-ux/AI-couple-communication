'use client';
import { supabase } from './supabase';
import type { DiaryEntry, Message, AiMessage, Grant } from './types';

/** 一次把主界面要用的东西全读回来。
 *  注意：这里读到的"对方的日记"永远是空的 —— 数据库不让读。
 *  只有对方主动开放（grants.is_open）的那几篇才会出现在 openedToMe 里。 */
export async function loadAll(coupleId: string, userId: string, partnerId: string) {
  const [myDiary, msgs, ai, myGrants, theirGrants, style, mine] = await Promise.all([
    supabase.from('diary_entries').select('*')
      .eq('couple_id', coupleId).eq('author_id', userId)
      .order('created_at', { ascending: false }),
    supabase.from('messages').select('*')
      .eq('couple_id', coupleId).order('created_at', { ascending: true }),
    supabase.from('ai_messages').select('*')
      .eq('couple_id', coupleId).eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase.from('grants').select('*')
      .eq('couple_id', coupleId).eq('owner_id', userId)
      .order('created_at', { ascending: false }),
    supabase.from('grants').select('*')
      .eq('couple_id', coupleId).neq('owner_id', userId).eq('is_open', true)
      .order('created_at', { ascending: false }),
    supabase.from('style_profiles').select('*').eq('user_id', partnerId).maybeSingle(),
    supabase.from('style_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  // 对方开放给我的日记原文：靠 RLS 放行，读得到就是真的被开放了
  const ids = (theirGrants.data ?? [])
    .filter((g: Grant) => g.kind === 'diary' && g.entry_id)
    .map((g: Grant) => g.entry_id as string);
  const opened = ids.length
    ? (await supabase.from('diary_entries').select('*').in('id', ids)).data ?? []
    : [];

  return {
    diary: (myDiary.data ?? []) as DiaryEntry[],
    messages: (msgs.data ?? []) as Message[],
    ai: (ai.data ?? []) as AiMessage[],
    myGrants: (myGrants.data ?? []) as Grant[],
    theirGrants: (theirGrants.data ?? []) as Grant[],
    openedToMe: opened as DiaryEntry[],
    // 对方的"表达习惯"。读不到就说明对方没写日记，或者关掉了那个总开关。
    partnerStyle: (style.data as { summary: string; share_enabled: boolean } | null) ?? null,
    myStyle: (mine.data as { summary: string; share_enabled: boolean } | null) ?? null,
  };
}

export type Loaded = Awaited<ReturnType<typeof loadAll>>;

export async function readMark(userId: string, coupleId: string, channel: string) {
  await supabase.from('read_state').upsert(
    { user_id: userId, couple_id: coupleId, channel, last_seen: new Date().toISOString() },
    { onConflict: 'user_id,couple_id,channel' }
  );
}

export async function readState(userId: string, coupleId: string) {
  const { data } = await supabase.from('read_state').select('*')
    .eq('user_id', userId).eq('couple_id', coupleId);
  const m: Record<string, string> = {};
  (data ?? []).forEach((r: { channel: string; last_seen: string }) => { m[r.channel] = r.last_seen; });
  return m;
}
