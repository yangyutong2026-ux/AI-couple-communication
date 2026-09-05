import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

type Reply = { observe?: string; you?: string; them?: string; stuck?: string; draft?: string };

/** 以"这个用户本人"的身份连数据库。
 *  所有 RLS 规则照常生效 —— 服务器不会因为在服务器上跑就多看到什么。
 *  对方的日记原文，在这里同样读不到。 */
function asUser(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: '没有登录' }, { status: 401 });

  const { coupleId, question } = await req.json();
  const db = asUser(token);

  const { data: auth } = await db.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return NextResponse.json({ error: '登录已过期' }, { status: 401 });

  const { data: couple } = await db.from('couples').select('*').eq('id', coupleId).maybeSingle();
  if (!couple) return NextResponse.json({ error: '找不到这段关系' }, { status: 404 });
  const partnerId: string = couple.member_a === uid ? couple.member_b : couple.member_a;

  const [{ data: profiles }, { data: myDiary }, { data: msgs }, { data: theirStyle }, { data: history }] =
    await Promise.all([
      db.from('profiles').select('*').in('id', [uid, partnerId]),
      db.from('diary_entries').select('*').eq('author_id', uid).eq('ai_readable', true)
        .order('created_at', { ascending: false }).limit(20),
      db.from('messages').select('*').eq('couple_id', coupleId)
        .order('created_at', { ascending: true }).limit(60),
      db.from('style_profiles').select('*').eq('user_id', partnerId).maybeSingle(),
      db.from('ai_messages').select('*').eq('couple_id', coupleId).eq('user_id', uid)
        .order('created_at', { ascending: true }).limit(20),
    ]);

  const nameOf = (id: string) =>
    (profiles ?? []).find((p: { id: string; display_name: string }) => p.id === id)?.display_name || '对方';
  const ME = nameOf(uid);
  const TA = nameOf(partnerId);

  // 对方主动开放给我的日记原文（RLS 放行才读得到）
  const { data: openGrants } = await db.from('grants').select('*')
    .eq('couple_id', coupleId).eq('owner_id', partnerId).eq('is_open', true);
  const openIds = (openGrants ?? []).filter((g) => g.kind === 'diary' && g.entry_id).map((g) => g.entry_id);
  const { data: openedEntries } = openIds.length
    ? await db.from('diary_entries').select('*').in('id', openIds)
    : { data: [] as { created_at: string; mood: string | null; body: string }[] };

  const styleKnown = !!theirStyle?.summary && theirStyle.share_enabled;
  const grantsKnown = (openedEntries ?? []).length > 0;
  const known = styleKnown || grantsKnown;

  // 顺手把"我自己的表达风格"更新一下，供对方那边使用。
  // 只写自己的那一行 —— RLS 也只允许这样。
  refreshMyStyle(db, uid, coupleId, myDiary ?? []).catch(() => {});

  let reply: Reply;
  if (process.env.ANTHROPIC_API_KEY) {
    reply = await askClaude({
      ME, TA, question, known,
      myDiary: myDiary ?? [], msgs: msgs ?? [],
      style: styleKnown ? theirStyle!.summary : '',
      opened: openedEntries ?? [],
      history: history ?? [],
    });
  } else {
    reply = offlineReply(ME, TA, question, known, msgs ?? []);
  }
  if (!known) reply = { ...reply, ...unilateral(TA, styleKnown) };

  await db.from('ai_messages').insert([
    { couple_id: coupleId, user_id: uid, role: 'user', content: { text: question } },
    { couple_id: coupleId, user_id: uid, role: 'assistant', content: reply },
  ]);

  return NextResponse.json({
    reply,
    sources: {
      myDiary: (myDiary ?? []).length,
      messages: (msgs ?? []).length,
      styleKnown,
      openedEntries: (openedEntries ?? []).length,
      live: !!process.env.ANTHROPIC_API_KEY,
    },
  });
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
function offlineReply(ME: string, TA: string, q: string, known: boolean, msgs: { body: string }[]): Reply {
  return {
    observe: `你们在「共同沟通」里一共说了 ${msgs.length} 句话。你刚才问的是："${q}"`,
    you: '模型还没接上（服务器上还没填 ANTHROPIC_API_KEY），所以这段是占位文字。接上之后，这里会是结合你的日记和你们对话之后，对你此刻情绪的具体分析。',
    them: known ? `这里会是对${TA}那边的理解 —— 基于TA的表达习惯，不含TA日记里的任何原文。` : '',
    stuck: '这里会是"你们两个真正卡住的地方"。',
    draft: '',
  };
}

/* ---------- 真正调用模型 ---------- */
async function askClaude(x: {
  ME: string; TA: string; question: string; known: boolean;
  myDiary: { created_at: string; mood: string | null; body: string }[];
  msgs: { sender_id: string; body: string }[];
  style: string;
  opened: { created_at: string; mood: string | null; body: string }[];
  history: { role: string; content: unknown }[];
}): Promise<Reply> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const diary = x.myDiary.map((e) => `[${e.created_at.slice(0, 10)}｜${e.mood || '未标注'}] ${e.body}`).join('\n') || '（无）';
  const log = x.msgs.map((m) => m.body).join('\n') || '（无）';
  const opened = x.opened.map((e) => `[${e.created_at.slice(0, 10)}｜${e.mood || '未标注'}] ${e.body}`).join('\n');

  const system = `你是「之间」，一个服务于伴侣与家人之间的沟通调解者。你现在服务的用户是${x.ME}，对方是${x.TA}。

【${x.ME}的日记 · 可以直接引用和回应】
${diary}

【${x.TA}的表达习惯 · 这是从TA的日记里抽象出来的几句话，你拿不到原文，也不要假装拿得到】
${x.style || '（暂无）'}

${opened ? `【${x.TA}主动开放给${x.ME}的日记原文 · TA本人按下开关同意的，可以直接引用】\n${opened}\n` : ''}
【共同沟通记录 · 双方都已看到，可自由引用】
${log}

原则：
- 不判断谁对谁错，不站队，不用"你应该""TA不该"这类句式。
- 把双方情绪背后的原因说出来，尤其是当事人自己也没意识到的部分。
- 语气克制、具体、不煽情，不堆砌心理学术语。
- 每段 2-4 句。
- 如果上面关于${x.TA}的信息是空的，不要推测TA的内心；直接承认你不了解，并建议${x.ME}去共同沟通窗口问本人。

只返回一个 JSON 对象，不要 markdown 代码块，不要任何额外文字：
{"observe":"客观复述发生了什么，只用共同沟通记录里的事实","you":"${x.ME}的情绪可能来自什么","them":"${x.TA}的情绪可能来自什么","stuck":"两个人真正卡住的地方","draft":"一句可以直接发给${x.TA}的话，第一人称、非指责、不超过60字；不合适则填空字符串"}`;

  const msgs = x.history
    .filter((h) => h.role === 'user')
    .map((h) => ({ role: 'user' as const, content: String((h.content as { text?: string })?.text ?? '') }))
    .filter((m) => m.content);
  msgs.push({ role: 'user', content: x.question });

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1200,
    system,
    messages: msgs,
  });
  const raw = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
  try {
    return JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    return { stuck: raw || '模型没有返回内容，可以再问一次。' };
  }
}

/* ---------- 把自己的日记抽象成几句"表达习惯" ---------- */
async function refreshMyStyle(
  db: ReturnType<typeof asUser>, uid: string, coupleId: string,
  diary: { body: string; mood: string | null }[]
) {
  if (!diary.length || !process.env.ANTHROPIC_API_KEY) return;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system: `下面是一个人的日记。请只提炼出TA的"表达习惯与情绪风格"，写 2-4 句话。
严禁出现日记里的任何具体事件、人物、时间、地点、物品。只写模式，例如"压力大时倾向沉默而不是解释""习惯先自责再表达需求"。
这段话会给TA的伴侣看，所以任何能让人反推出日记内容的细节都是严重错误。只输出那几句话本身。`,
    messages: [{ role: 'user', content: diary.map((d) => d.body).join('\n---\n') }],
  });
  const summary = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
  if (summary) {
    await db.from('style_profiles').upsert(
      { user_id: uid, couple_id: coupleId, summary, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  }
}
