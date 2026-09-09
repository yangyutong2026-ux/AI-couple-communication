'use client';
import { supabase } from '@/lib/supabase';

export type Reply = { observe?: string; you?: string; them?: string; stuck?: string; draft?: string };

/** 调模型的地址。留空就走浏览器里的占位回复。
 *  第三步会把它指向 Supabase Edge Function —— key 存在那边，浏览器永远拿不到。 */
const AI_ENDPOINT = process.env.NEXT_PUBLIC_AI_ENDPOINT || '';

export const aiIsLive = !!AI_ENDPOINT;

export async function askAI(coupleId: string, question: string): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error('登录已过期，刷新一下页面');

  if (AI_ENDPOINT) {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ coupleId, question }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'AI 服务出错了');
    return;
  }

  await offlinePath(coupleId, question);
}

/* ---------- 还没接模型时：流程完全一致，只是回复是占位文字 ----------
   注意这里读到的每一条数据都仍然经过数据库的 RLS 规则。
   对方的日记原文在这里同样读不到 —— 换到浏览器里跑，一点权限都没多。 */
async function offlinePath(coupleId: string, question: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('登录已过期');

  const { data: couple } = await supabase.from('couples').select('*').eq('id', coupleId).maybeSingle();
  if (!couple) throw new Error('找不到这段关系');
  const partnerId: string = couple.member_a === uid ? couple.member_b : couple.member_a;

  const [{ data: profiles }, { data: msgs }, { data: theirStyle }, { data: openGrants }] = await Promise.all([
    supabase.from('profiles').select('*').in('id', [uid, partnerId]),
    supabase.from('messages').select('id').eq('couple_id', coupleId).limit(60),
    supabase.from('style_profiles').select('*').eq('user_id', partnerId).maybeSingle(),
    supabase.from('grants').select('*').eq('couple_id', coupleId).eq('owner_id', partnerId).eq('is_open', true),
  ]);

  const nameOf = (id: string) =>
    (profiles ?? []).find((p: { id: string; display_name: string }) => p.id === id)?.display_name || '对方';
  const TA = nameOf(partnerId);

  const styleKnown = !!theirStyle?.summary && theirStyle.share_enabled;
  const grantsKnown = (openGrants ?? []).some((g: { kind: string }) => g.kind === 'diary');
  const known = styleKnown || grantsKnown;

  let reply = offlineReply(TA, question, known, (msgs ?? []).length);
  if (!known) reply = { ...reply, ...unilateral(TA, styleKnown) };

  const { error } = await supabase.from('ai_messages').insert([
    { couple_id: coupleId, user_id: uid, role: 'user', content: { text: question } },
    { couple_id: coupleId, user_id: uid, role: 'assistant', content: reply },
  ]);
  if (error) throw new Error(error.message);
}

/* ---------- 我对对方了解不足时：不猜，承认，把问题交回给两个人 ---------- */
function unilateral(TA: string, styleKnown: boolean): Reply {
  return {
    them: `这里我得说实话：关于${TA}，我手上几乎没有东西。${
      styleKnown ? '' : `${TA}还没有开放让我读TA的日记，`
    }所以我对TA的了解，只剩下你们两个人摊在明面上说过的那几句话。我可以顺着你的讲法去猜TA在想什么 —— 但那更像是在替TA编一个说得通的理由，不是真的理解TA。我不想那样做，因为猜错的代价会落在你们两个人身上。`,
    stuck: `你现在缺的不是分析，是${TA}本人的一句话。与其让我替TA回答，不如你直接去「共同沟通」那边问TA。诀窍是：问一个TA不需要立刻辩解的问题 —— "你当时在想什么"比"你为什么要那样"好接得多。`,
    draft: `有件事我想问你，你可以慢慢回，也可以先不回：那天你没说话的时候，心里在想什么？我不是要你解释，就是想知道。`,
  };
}

/* ---------- 还没接模型时的占位回复 ---------- */
function offlineReply(TA: string, q: string, known: boolean, msgCount: number): Reply {
  return {
    observe: `你们在「共同沟通」里一共说了 ${msgCount} 句话。你刚才问的是："${q}"`,
    you: '模型还没接上，所以这段是占位文字。接上之后，这里会是结合你的日记和你们的对话之后，对你此刻情绪的具体分析。',
    them: known ? `这里会是对${TA}那边的理解 —— 基于TA的表达习惯，不含TA日记里的任何原文。` : '',
    stuck: '这里会是"你们两个真正卡住的地方"。',
    draft: '',
  };
}
