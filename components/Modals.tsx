'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { when, excerpt } from '@/lib/format';
import { Icon } from './Icons';
import { soften } from './Shared';
import type { AiMessage, DiaryEntry, Grant } from '@/lib/types';

function Shell({ kicker, title, desc, children, foot, onClose }: {
  kicker: string; title: string; desc: React.ReactNode;
  children: React.ReactNode; foot: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="mask" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" role="dialog" aria-modal="true">
        <div className="card-head">
          <div className="kicker">{kicker}</div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        <div className="card-body">{children}</div>
        <div className="card-foot">{foot}</div>
      </div>
    </div>
  );
}

/* ============ 直接发送前的缓冲：翻译器真正介入的地方 ============ */
export function SoftenModal({ raw, partnerName, coupleId, userId, onDone, onClose }: {
  raw: string; partnerName: string; coupleId: string; userId: string;
  onDone: () => void; onClose: () => void;
}) {
  const [text, setText] = useState(soften(raw));
  const [busy, setBusy] = useState(false);

  async function send(body: string, assisted: boolean) {
    setBusy(true);
    await supabase.from('messages').insert({ couple_id: coupleId, sender_id: userId, body, ai_assisted: assisted });
    setBusy(false); onDone(); onClose();
  }

  return (
    <Shell kicker="发送前" title="这句话，要原样发出去吗？"
      desc={`AI 读到这句话里带着情绪。它不评判你说得对不对 —— 只是把同一件事换一种${partnerName}更容易接住的说法。两个版本你都可以选。`}
      onClose={onClose}
      foot={<>
        <button className="btn ghost" disabled={busy} onClick={() => send(raw, false)}>仍然发原话</button>
        <button className="btn me" disabled={busy} onClick={() => send(text.trim() || raw, true)}>发送这一版</button>
      </>}>
      <div className="fieldlab">你写的</div>
      <div className="orig">{raw}</div>
      <div className="fieldlab">AI 的另一种说法 · 可修改</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
    </Shell>
  );
}

/* ============ AI 草稿的发送授权：三个眼睛 ============ */
export function ConfirmModal({
  draft, partnerName, coupleId, userId, myDiary, aiThread, onDone, onClose,
}: {
  draft: string; partnerName: string; coupleId: string; userId: string;
  myDiary: DiaryEntry[]; aiThread: AiMessage[];
  onDone: () => void; onClose: () => void;
}) {
  const [text, setText] = useState(draft);
  const [on, setOn] = useState({ diary: false, thread: false, mark: false });
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const openable = myDiary.filter((e) => e.ai_readable);
  const hiddenCount = myDiary.length - openable.length;
  const [picked, setPicked] = useState<Set<string>>(new Set(openable.slice(0, 3).map((e) => e.id)));
  const shown = showAll ? openable : openable.slice(0, 3);

  const label = (k: 'diary' | 'thread' | 'mark') => {
    if (k === 'diary') return on.diary
      ? <><b>{partnerName} 可以读你勾选的日记</b>（原文，随这句话一起过去）</>
      : <>{partnerName} <b>看不到</b>：你的日记</>;
    if (k === 'thread') return on.thread
      ? <><b>{partnerName} 可以看到</b>你和 AI 的这段对话</>
      : <>{partnerName} <b>看不到</b>：你和 AI 的这段对话</>;
    return on.mark
      ? <><b>告诉 {partnerName}</b>：这句话是 AI 帮我起草的</>
      : <>{partnerName} <b>不会知道</b>这句话是 AI 帮你起草的</>;
  };

  async function confirm() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);

    await supabase.from('messages').insert({
      couple_id: coupleId, sender_id: userId, body, ai_assisted: on.mark,
    });

    if (on.diary && picked.size) {
      const { data: existing } = await supabase.from('grants').select('*')
        .eq('couple_id', coupleId).eq('owner_id', userId).eq('kind', 'diary');
      const have = new Map((existing ?? []).map((g: Grant) => [g.entry_id, g]));
      const toInsert: object[] = [];
      for (const eid of picked) {
        const g = have.get(eid);
        if (g) await supabase.from('grants').update({ is_open: true }).eq('id', g.id);
        else toInsert.push({ couple_id: coupleId, owner_id: userId, kind: 'diary', entry_id: eid, is_open: true });
      }
      if (toInsert.length) await supabase.from('grants').insert(toInsert);
    }

    if (on.thread) {
      const turns = aiThread.map((m) => ({
        role: m.role,
        text: m.role === 'user'
          ? (m.content as { text: string }).text
          : ['observe', 'you', 'them', 'stuck']
              .map((k) => (m.content as Record<string, string>)[k])
              .filter(Boolean).join('\n\n'),
      }));
      await supabase.from('grants').insert({
        couple_id: coupleId, owner_id: userId, kind: 'ai_thread', snapshot: { turns }, is_open: true,
      });
    }

    setBusy(false); onDone(); onClose();
  }

  return (
    <Shell kicker="发送授权" title={`${partnerName} 将会看到这句话`}
      desc="这句话会出现在「共同沟通」里，和你自己打字发过去没有区别。发送前你可以随意修改。"
      onClose={onClose}
      foot={<>
        <button className="btn ghost" disabled={busy} onClick={onClose}>先不发</button>
        <button className="btn me" disabled={busy} onClick={confirm}>确认发送</button>
      </>}>
      <div className="fieldlab">将发送的内容</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />

      <div className="willsee">
        <div className="hint">默认全部关闭。点一下眼睛，可以主动打开给{partnerName}看。</div>

        <button className="wrow" type="button" aria-pressed={on.diary}
                onClick={() => setOn({ ...on, diary: !on.diary })}>
          <span className="ic">{on.diary ? Icon.eye : Icon.eyeoff}</span>
          <span className="tx">{label('diary')}</span>
        </button>

        {on.diary && (
          <div className="pick">
            <div className="hint">先帮你勾了最近的三篇 —— 它们离你们现在这件事最近。</div>
            {shown.length === 0
              ? <div className="locked">你还没有任何 AI 可读的日记。</div>
              : shown.map((e) => (
                <label className="pickrow" key={e.id}>
                  <input type="checkbox" checked={picked.has(e.id)} onChange={(ev) => {
                    const n = new Set(picked);
                    ev.target.checked ? n.add(e.id) : n.delete(e.id);
                    setPicked(n);
                  }} />
                  <span className="pm">
                    <span className="stamp">{when(e.created_at)}{e.mood ? ' · ' + e.mood : ''}</span>
                    <span className="ex">{excerpt(e.body, 64)}</span>
                  </span>
                </label>
              ))}
            {!showAll && openable.length > 3 && (
              <button className="btn ghost morebtn" type="button" onClick={() => setShowAll(true)}>勾选更多日记</button>
            )}
            {hiddenCount > 0 && (
              <div className="locked">
                另有 {hiddenCount} 篇标为「仅自己」，不在这里列出 —— 那是你连 AI 都没让读的。
              </div>
            )}
          </div>
        )}

        <button className="wrow" type="button" aria-pressed={on.thread}
                onClick={() => setOn({ ...on, thread: !on.thread })}>
          <span className="ic">{on.thread ? Icon.eye : Icon.eyeoff}</span>
          <span className="tx">{label('thread')}</span>
        </button>

        <button className="wrow" type="button" aria-pressed={on.mark}
                onClick={() => setOn({ ...on, mark: !on.mark })}>
          <span className="ic">{on.mark ? Icon.eye : Icon.eyeoff}</span>
          <span className="tx">{label('mark')}</span>
        </button>
      </div>
    </Shell>
  );
}

/* ============ 文件空间：管理已经开放出去的内容 ============ */
export function FilesModal({ grants, myDiary, partnerName, onDone, onClose }: {
  grants: Grant[]; myDiary: DiaryEntry[]; partnerName: string;
  onDone: () => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const diaryGrants = grants.filter((g) => g.kind === 'diary');
  const threadGrants = grants.filter((g) => g.kind === 'ai_thread');
  const openN = grants.filter((g) => g.is_open).length;
  const has = grants.length > 0;

  async function flip(g: Grant) {
    setBusy(true);
    await supabase.from('grants').update({ is_open: !g.is_open }).eq('id', g.id);
    setBusy(false); onDone();
  }

  return (
    <Shell kicker="文件空间" title={`你开放给${partnerName}的内容`}
      desc={has
        ? <>此刻有 <b>{openN}</b> 项开着。关掉之后{partnerName}会立刻看不到 —— 已经读进去的东西你收不回来，但从这一刻起它不再出现在TA那边。</>
        : <>你还没有开放过任何东西。在发送授权那一步点亮眼睛之后，开放的内容会出现在这里，随时可以关掉。</>}
      onClose={onClose}
      foot={<button className="btn ghost" onClick={onClose}>关闭</button>}>
      {!has ? (
        <div className="fileempty">这里是空的。<br />你写下的每一个字，目前都还只在你自己这里。</div>
      ) : (
        <>
          {diaryGrants.length > 0 && <div className="filegroup">日记原文</div>}
          {diaryGrants.map((g) => {
            const e = myDiary.find((d) => d.id === g.entry_id);
            return (
              <div className="relrow" key={g.id}>
                <div>
                  <div className="rt">{e ? when(e.created_at) : '（已删除的日记）'}{e?.mood ? ' · ' + e.mood : ''}</div>
                  <div className="rd">{e ? excerpt(e.body, 52) : ''}</div>
                </div>
                <div className="spacer" />
                <button className="sw" disabled={busy} aria-pressed={g.is_open} onClick={() => flip(g)} aria-label="切换开放" />
              </div>
            );
          })}
          {threadGrants.length > 0 && <div className="filegroup">与 AI 的对话</div>}
          {threadGrants.map((g) => (
            <div className="relrow" key={g.id}>
              <div>
                <div className="rt">你和 AI 的一段对话</div>
                <div className="rd">
                  {when(g.created_at)}开放 · 共 {(g.snapshot?.turns ?? []).length} 条往来。
                  {excerpt((g.snapshot?.turns ?? [])[0]?.text || '', 40)}
                </div>
              </div>
              <div className="spacer" />
              <button className="sw" disabled={busy} aria-pressed={g.is_open} onClick={() => flip(g)} aria-label="切换开放" />
            </div>
          ))}
        </>
      )}
    </Shell>
  );
}

/* ============ 关系与隐私 ============ */
export function RelationshipModal({
  partnerName, inviteCode, coupleId, userId, shareEnabled, days, onDone, onClose, onDisconnect,
}: {
  partnerName: string; inviteCode: string; coupleId: string; userId: string;
  shareEnabled: boolean; days: number;
  onDone: () => void; onClose: () => void; onDisconnect: () => void;
}) {
  const [share, setShare] = useState(shareEnabled);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    setBusy(true);
    await supabase.from('style_profiles').upsert(
      { user_id: userId, couple_id: coupleId, share_enabled: share },
      { onConflict: 'user_id' }
    );
    setBusy(false); onDone(); onClose();
  }

  async function disconnect() {
    setBusy(true);
    await supabase.from('couples').update({ disconnected_at: new Date().toISOString() }).eq('id', coupleId);
    setBusy(false); onClose(); onDisconnect();
  }

  if (confirming) {
    return (
      <Shell kicker="不可撤销" title={`确定要断开和${partnerName}的连接吗`}
        desc={`${partnerName}下次打开时会发现连接已经断了。你们的共同记录会停在此刻。`}
        onClose={() => setConfirming(false)}
        foot={<>
          <button className="btn ghost" onClick={() => setConfirming(false)}>再想想</button>
          <button className="btn ghost danger" disabled={busy} onClick={disconnect}>确认断开</button>
        </>}>
        <div className="willsee">
          <div>{Icon.eyeoff}<span>你的日记 <b>留在你这里</b>，不受影响</span></div>
          <div>{Icon.eyeoff}<span>{partnerName}的日记留在{partnerName}那里，你本来也看不到</span></div>
          <div>{Icon.eyeoff}<span>AI 立刻失去对双方的全部访问</span></div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell kicker="关系与隐私" title={`你和${partnerName}`}
      desc={<>已经连接 {days} 天。下面每一项都只管你自己这一侧 —— {partnerName}那边有一套一模一样的开关，你们互相看不到、也改不了对方的。</>}
      onClose={onClose}
      foot={<>
        <button className="btn ghost" onClick={onClose}>关闭</button>
        <button className="btn me" disabled={busy} onClick={save}>保存</button>
      </>}>
      <div className="relrow">
        <div>
          <div className="rt">让 AI 用我的日记，帮{partnerName}理解我</div>
          <div className="rd">
            打开后，{partnerName}和 AI 聊天时，AI 可以参考你日记里透出来的<b>表达习惯</b>
            （比如&quot;累的时候会变得直接&quot;），但绝不会引用你写的任何一句原话 —— 那几句话是单独存的，
            {partnerName}的账号连你的日记表都碰不到。关掉后，TA那边的 AI 就只知道你们摊在明面上说过的话。
          </div>
        </div>
        <div className="spacer" />
        <button className="sw" aria-pressed={share} onClick={() => setShare(!share)} aria-label="切换授权" />
      </div>

      <div className="relrow">
        <div>
          <div className="rt">邀请码</div>
          <div className="rd" style={{ fontFamily: 'var(--mono)', letterSpacing: '.08em' }}>
            {inviteCode} · 已被{partnerName}使用
          </div>
        </div>
      </div>

      <div className="relrow">
        <div>
          <div className="rt">如果有一天要断开</div>
          <div className="rd">
            共同沟通的记录停在断开那一刻。<b>各自的日记留在各自这里</b> —— 对方从来就没有拥有过它们，
            所以也没有什么需要&quot;还&quot;。AI 会立刻同时失去两边的访问权。
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <button className="btn ghost danger" style={{ width: '100%' }} onClick={() => setConfirming(true)}>
          断开与{partnerName}的连接
        </button>
      </div>
    </Shell>
  );
}
