'use client';
import { useState } from 'react';
import { askAI } from '@/lib/ai';
import { when } from '@/lib/format';
import { Icon } from './Icons';
import type { AiMessage, DiaryEntry, Grant } from '@/lib/types';

type Props = {
  ai: AiMessage[];
  openedToMe: DiaryEntry[];
  theirGrants: Grant[];
  partnerStyle: { summary: string; share_enabled: boolean } | null;
  myDiaryCount: number;
  messageCount: number;
  coupleId: string;
  partnerName: string;
  onChange: () => void;
  onDraft: (draft: string) => void;
};

export default function AiChat({
  ai, openedToMe, theirGrants, partnerStyle, myDiaryCount, messageCount,
  coupleId, partnerName, onChange, onDraft,
}: Props) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const styleKnown = !!partnerStyle?.summary && partnerStyle.share_enabled;
  const known = styleKnown || openedToMe.length > 0;
  const threadGrants = theirGrants.filter((g) => g.kind === 'ai_thread' && g.is_open);

  async function ask() {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true); setErr(''); setQ('');
    try {
      await askAI(coupleId, text);
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="privacy">
        {Icon.lock}
        <div>
          <div className="h">只有你和 AI 在这里</div>
          <div className="d">
            {partnerName}看不到这一页。AI 会结合你的日记、你们说过的话，以及从{partnerName}日记里抽象出来的<b>表达习惯</b>
            （不是内容）来回应你。任何要发给对方的话，都要经过你确认。
          </div>
        </div>
      </div>

      {/* 对方主动开放过来的东西 */}
      {openedToMe.length > 0 && (
        <details className="incoming">
          <summary>
            {Icon.eye}
            <span className="sp"><b>{partnerName}</b> 把TA的 {openedToMe.length} 篇日记开放给你了</span>
            <span className="more" />
          </summary>
          <div className="inbody">
            {openedToMe.map((e) => (
              <div className="ie" key={e.id}>
                <span className="stamp">{when(e.created_at)}{e.mood ? ' · ' + e.mood : ''}</span>
                <div className="tx">{e.body}</div>
              </div>
            ))}
            <div className="note">
              这是{partnerName}自己按下开关打开的，不是 AI 透给你的。AI 现在也读到了这些原文，所以接下来它可以直接引用。
              {partnerName}随时可以再关上，关上的那一刻你这里就看不到了。
            </div>
          </div>
        </details>
      )}

      {threadGrants.map((g) => (
        <details className="incoming" key={g.id}>
          <summary>
            {Icon.eye}
            <span className="sp"><b>{partnerName}</b> 把TA和 AI 的那段对话开放给你了</span>
            <span className="more" />
          </summary>
          <div className="inbody">
            {(g.snapshot?.turns ?? []).map((t, i) => (
              <div className="ie" key={i}>
                <span className="stamp">{t.role === 'user' ? `${partnerName} 问 AI` : `AI 对${partnerName}说`}</span>
                <div className="tx">{t.text}</div>
              </div>
            ))}
            <div className="note">{partnerName}选择让你看见TA是怎么跟 AI 讲这件事的 —— 包括TA问了什么。</div>
          </div>
        </details>
      ))}

      {!known && (
        <div className="lowsig">
          {Icon.eyeoff}
          <div>
            <div className="lt">AI 对{partnerName}了解得很少</div>
            <div className="ld">
              它不会因此就开始猜。接下来的建议里，关于{partnerName}的那一段，它会直说自己不知道，并且倾向于让你去问本人。
            </div>
          </div>
        </div>
      )}

      <div className="sources">
        <span>AI 手上有：</span>
        <span><b>你的日记 {myDiaryCount} 篇</b></span>
        {openedToMe.length > 0 && (
          <span><b style={{ color: 'var(--them)' }}>{partnerName}主动开放的 {openedToMe.length} 篇原文</b></span>
        )}
        <span>
          {styleKnown
            ? <b>{partnerName}的表达习惯（不含原文）</b>
            : <b style={{ color: 'var(--warn)' }}>{partnerName}的表达习惯暂时读不到</b>}
        </span>
        <span><b>共同对话 {messageCount} 条</b></span>
      </div>

      {ai.length === 0 ? (
        <div className="empty">
          AI 不会替你们判断谁对谁错。<br />
          它只做一件事：把两边的情绪翻译成对方能听懂的话。
          <br />
          <span className="q" onClick={() => setQ('TA为什么突然就不说话了？')}>
            &quot;TA为什么突然就不说话了？&quot;
          </span>
        </div>
      ) : ai.map((m) => {
        if (m.role === 'user') {
          return <div className="ask" key={m.id}>{(m.content as { text: string }).text}</div>;
        }
        const c = m.content as { observe?: string; you?: string; them?: string; stuck?: string; draft?: string };
        return (
          <div className="reply" key={m.id}>
            <div className="reply-head"><span className="mark">{Icon.mediator}</span>之间 · 不站队的第三个人</div>
            {c.observe && <Seg title="发生了什么" text={c.observe} />}
            {c.you && <Seg cls="you" title="你这边" text={c.you} />}
            {c.them && <Seg cls="them" title={`${partnerName}那边`} text={c.them} />}
            {c.stuck && <Seg title="真正卡住的地方" text={c.stuck} />}
            {c.draft && (
              <div className="draftcard">
                <div className="dh">{Icon.lock} 待你确认 · 尚未发送</div>
                <div className="dq">{c.draft}</div>
                <div className="da">
                  <span className="spacer" />
                  <button className="btn me" onClick={() => onDraft(c.draft!)}>
                    {Icon.send} 查看并发送给 {partnerName}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {busy && <div className="thinking">正在把两边的话放在一起看</div>}
      {err && <div className="formerr" style={{ margin: '8px 0 14px' }}>{err}</div>}

      <div className="composer">
        <h4>问 AI</h4>
        <textarea value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="发生了什么、你现在的感觉、你卡在哪里……" />
        <div className="crow">
          <span className="spacer" />
          <button className="btn" onClick={ask} disabled={busy || !q.trim()}>发送</button>
        </div>
      </div>
    </>
  );
}

function Seg({ cls = '', title, text }: { cls?: string; title: string; text: string }) {
  return (
    <div className={`seg-block ${cls}`}>
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  );
}
