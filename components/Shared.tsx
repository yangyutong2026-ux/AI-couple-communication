'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { when } from '@/lib/format';
import { Icon } from './Icons';
import type { Message } from '@/lib/types';

const HEATED = [/你总是/, /你从来/, /根本不/, /算了/, /随便你/, /无所谓/, /你就是/, /懒/, /有意思吗/, /爱怎样怎样/, /？？/, /！！/, /你能不能/];
export const isHeated = (t: string) => HEATED.some((r) => r.test(t));

/** 演示用的示例改写。第三步接上模型之后，这里会换成真的调用。 */
export function soften(t: string): string {
  if (/算了|随便你|无所谓|爱怎样怎样/.test(t))
    return '我刚才想说"算了"，但其实我不是不在乎 —— 我是怕再说下去我们会吵起来。这件事我们能晚点再聊吗？';
  if (/你总是|你从来|根本不/.test(t))
    return '有件事我反复在意，我知道我刚才的说法像在翻旧账。我想说的其实是：这种时候我会觉得自己没被顾到，而不是想数落你。';
  if (/你能不能|你就不能/.test(t))
    return '有件事想请你帮个忙。我犹豫了一下才开口，因为我知道你最近也很累 —— 但我今天真的有点撑不住了。';
  if (/懒|什么都不干|不做事/.test(t))
    return '我现在情绪有点上来了，先把话说慢一点：我在意的不是这件事本身，是我好像一直在一个人扛，而你没看见。';
  return `我先把情绪放一放再说：${t.replace(/[！!？?]+$/, '')}。说这些不是想怪你，是想让你知道我现在的状态。`;
}

export default function Shared({
  messages, coupleId, userId, memberA, partnerName, onChange, onGoAI, onSoften,
}: {
  messages: Message[]; coupleId: string; userId: string; memberA: string; partnerName: string;
  onChange: () => void; onGoAI: () => void; onSoften: (raw: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const stuck = messages.slice(-3).some((m) => /^…|^\.\.\.|算了|随便|无所谓/.test(m.body));

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    if (isHeated(t)) { onSoften(t); return; }
    setBusy(true);
    await supabase.from('messages').insert({ couple_id: coupleId, sender_id: userId, body: t });
    setText(''); setBusy(false);
    onChange();
  }

  return (
    <>
      <div className="privacy">
        {Icon.two}
        <div>
          <div className="h">这一页你们两个人都能看到</div>
          <div className="d">
            AI 会读这里，用来了解事情的经过。但它不会在这里出现、不会插话、不会评理 —— 这个空间属于你们两个人。
          </div>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="empty">还没有人说话。<br />这里的每一句，你们两个都看得到。</div>
      ) : messages.map((m) => (
        <div className={`row ${m.sender_id === userId ? 'mine' : ''}`} key={m.id}>
          <div className={`msg ${m.sender_id === memberA ? 'from-A' : 'from-B'}`}>
            <div className="who">{m.sender_id === userId ? '你' : partnerName} · {when(m.created_at)}</div>
            {m.body}
            {m.ai_assisted && <div className="via">{Icon.mediator} 经 AI 协助起草</div>}
          </div>
        </div>
      ))}

      {stuck && (
        <div className="nudge">
          <div className="h">这段对话停在这里了。</div>
          <div className="d">AI 不会在这里说话。如果你想弄清楚刚才到底发生了什么，可以去旁边的房间单独聊。</div>
          <div className="crow"><span className="spacer" />
            <button className="btn ghost" onClick={onGoAI}>去和 AI 聊聊</button>
          </div>
        </div>
      )}

      <div className="composer">
        <h4>直接对 {partnerName} 说</h4>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="想说什么就写什么，情绪也可以带着……" />
        <div className="crow">
          <span className="spacer" />
          <button className="btn me" onClick={send} disabled={busy || !text.trim()}>发送</button>
        </div>
      </div>
    </>
  );
}
