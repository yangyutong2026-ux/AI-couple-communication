'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { when } from '@/lib/format';
import { Icon } from './Icons';
import type { DiaryEntry } from '@/lib/types';

const MOODS = ['疲惫', '委屈', '生气', '焦虑', '平静', '松了口气'];

export default function Diary({
  entries, coupleId, userId, partnerName, onChange,
}: {
  entries: DiaryEntry[]; coupleId: string; userId: string;
  partnerName: string; onChange: () => void;
}) {
  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const readable = entries.filter((e) => e.ai_readable).length;

  async function save() {
    if (!text.trim() || busy) return;
    setBusy(true);
    await supabase.from('diary_entries').insert({
      couple_id: coupleId, author_id: userId, body: text.trim(), mood,
    });
    setText(''); setMood(null); setBusy(false);
    onChange();
  }

  async function toggle(e: DiaryEntry) {
    await supabase.from('diary_entries').update({ ai_readable: !e.ai_readable }).eq('id', e.id);
    onChange();
  }

  return (
    <>
      <div className="privacy">
        {Icon.lock}
        <div>
          <div className="h">只有你能看到这一页</div>
          <div className="d">
            AI 会读这里，用来理解你是一个怎样的人 —— 但它不会在这里说话。{partnerName}的账号去数据库里查这些内容会被直接拒绝，
            这是规则强制的。每篇日记都可以单独关掉。
          </div>
        </div>
      </div>

      <div className="readline">
        <span>AI 已阅读 {readable} / {entries.length} 篇 · 未作回应</span>
        <span className="bar" />
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          这里还是空的。<br />
          不用写得完整，也不用写给谁看 ——<br />
          写下今天真正想说、但最后没说出口的那一句就够了。
        </div>
      ) : entries.map((e) => (
        <article className="entry" key={e.id}>
          <div className="entry-head">
            <span className="stamp">{when(e.created_at)}</span>
            {e.mood && <span className="mood" style={{ color: 'var(--me)' }}>{e.mood}</span>}
            <button className="accessbtn" data-private={!e.ai_readable} onClick={() => toggle(e)}>
              {e.ai_readable ? Icon.eye : Icon.eyeoff}
              {e.ai_readable ? 'AI 可读' : '仅自己'}
            </button>
          </div>
          <div className="entry-body">{e.body}</div>
        </article>
      ))}

      <div className="composer">
        <h4>写今天</h4>
        <textarea value={text} onChange={(ev) => setText(ev.target.value)}
                  placeholder="不用组织语言，写乱一点也没关系……" />
        <div className="moodpick">
          {MOODS.map((m) => (
            <button key={m} aria-pressed={mood === m} onClick={() => setMood(mood === m ? null : m)}>{m}</button>
          ))}
        </div>
        <div className="crow">
          <span className="spacer" />
          <button className="btn me" onClick={save} disabled={busy || !text.trim()}>
            {busy ? '保存中……' : '保存'}
          </button>
        </div>
        <div className="notefoot">写下的内容存在数据库里，只有你的账号读得到。</div>
      </div>
    </>
  );
}
