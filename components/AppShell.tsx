'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadAll, readMark, readState, type Loaded } from '@/lib/data';
import { Icon } from './Icons';
import Diary from './Diary';
import Shared from './Shared';
import AiChat from './AiChat';
import { SoftenModal, ConfirmModal, FilesModal, RelationshipModal } from './Modals';
import type { Couple, Profile } from '@/lib/types';

type Tab = 'diary' | 'shared' | 'ai';
type Modal = null | { k: 'soften'; raw: string } | { k: 'confirm'; draft: string } | { k: 'files' } | { k: 'rel' };

export default function AppShell({
  couple, me, partner, onLeave,
}: { couple: Couple; me: Profile; partner: Profile; onLeave: () => void }) {
  const [tab, setTab] = useState<Tab>('diary');
  const [d, setD] = useState<Loaded | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<Modal>(null);

  const iAmA = couple.member_a === me.id;

  const refresh = useCallback(async () => {
    const [data, rs] = await Promise.all([
      loadAll(couple.id, me.id, partner.id),
      readState(me.id, couple.id),
    ]);
    setD(data);
    setSeen(rs);
  }, [couple.id, me.id, partner.id]);

  useEffect(() => { refresh(); }, [refresh]);

  // 对方是在另一台设备上用的，所以隔一会儿看一眼有没有新东西
  useEffect(() => {
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  // 切到某个 tab 就把它标记成已读
  useEffect(() => {
    if (!d) return;
    const ch = tab === 'shared' ? 'messages' : tab === 'ai' ? 'grants' : null;
    if (!ch) return;
    readMark(me.id, couple.id, ch).then(() => readState(me.id, couple.id).then(setSeen));
  }, [tab, d, me.id, couple.id]);

  const dots = useMemo(() => {
    if (!d) return { shared: 0, ai: 0 };
    const after = (iso: string | undefined, ts: string) => !iso || ts > iso;
    return {
      shared: d.messages.filter((m) => m.sender_id !== me.id && after(seen['messages'], m.created_at)).length,
      ai: d.theirGrants.filter((g) => after(seen['grants'], g.created_at)).length,
    };
  }, [d, seen, me.id]);

  const days = Math.max(1, Math.round((Date.now() - new Date(couple.created_at).getTime()) / 86400000));

  if (!d) return <div className="app"><main><div className="empty">正在读取……</div></main></div>;

  return (
    <div className="app" style={{
      ['--me' as string]: iAmA ? 'var(--a)' : 'var(--b)',
      ['--them' as string]: iAmA ? 'var(--b)' : 'var(--a)',
    }}>
      <header className="top">
        <div className="brandrow">
          <div className="seal" aria-hidden="true"><span>之</span><span>间</span></div>
          <div>
            <h1 className="wordmark">之间</h1>
            <div className="tagline">两个人之间，需要一个不站队的翻译者。</div>
          </div>
          <div className="topright">
            <button className="iconbtn" title="文件空间" aria-label="文件空间"
                    onClick={() => setModal({ k: 'files' })}>{Icon.folder}</button>
            <button className="iconbtn" title="关系与隐私" aria-label="关系与隐私"
                    onClick={() => setModal({ k: 'rel' })}>{Icon.gear}</button>
          </div>
        </div>
        <div className="viewbar">
          <span className="lab">当前登录</span>
          <div className="seg">
            <button data-on={iAmA ? 'A' : 'B'}><span className="dot" />{me.display_name}</button>
          </div>
          <span className="lab">和 {partner.display_name} 一起用</span>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {(['diary', 'shared', 'ai'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            <span className="t">
              {t === 'diary' ? '日记本' : t === 'shared' ? '共同沟通' : '与 AI 对话'}
              {t !== 'diary' && dots[t] > 0 && <span className="badge-dot" />}
            </span>
            <span className="s">{t === 'diary' ? '仅自己' : t === 'shared' ? '双方可见' : '仅你与AI'}</span>
          </button>
        ))}
      </nav>

      <main>
        {tab === 'diary' && (
          <Diary entries={d.diary} coupleId={couple.id} userId={me.id}
                 partnerName={partner.display_name} onChange={refresh} />
        )}
        {tab === 'shared' && (
          <Shared messages={d.messages} coupleId={couple.id} userId={me.id}
                  memberA={couple.member_a}
                  partnerName={partner.display_name} onChange={refresh}
                  onGoAI={() => setTab('ai')}
                  onSoften={(raw) => setModal({ k: 'soften', raw })} />
        )}
        {tab === 'ai' && (
          <AiChat ai={d.ai} openedToMe={d.openedToMe} theirGrants={d.theirGrants}
                  partnerStyle={d.partnerStyle} myDiaryCount={d.diary.filter((e) => e.ai_readable).length}
                  messageCount={d.messages.length} coupleId={couple.id}
                  partnerName={partner.display_name} onChange={refresh}
                  onDraft={(draft) => setModal({ k: 'confirm', draft })} />
        )}
      </main>

      <footer className="foot">
        <span className="badge">{me.display_name}</span>
        <span>连接 {days} 天 · {couple.invite_code}</span>
        <span className="spacer" />
        <button className="btn quiet" onClick={() => supabase.auth.signOut()}>退出登录</button>
      </footer>

      {modal?.k === 'soften' && (
        <SoftenModal raw={modal.raw} partnerName={partner.display_name} coupleId={couple.id}
                     userId={me.id} onDone={refresh} onClose={() => setModal(null)} />
      )}
      {modal?.k === 'confirm' && (
        <ConfirmModal draft={modal.draft} partnerName={partner.display_name} coupleId={couple.id}
                      userId={me.id} myDiary={d.diary} aiThread={d.ai}
                      onDone={() => { refresh(); setTab('shared'); }} onClose={() => setModal(null)} />
      )}
      {modal?.k === 'files' && (
        <FilesModal grants={d.myGrants} myDiary={d.diary} partnerName={partner.display_name}
                    onDone={refresh} onClose={() => setModal(null)} />
      )}
      {modal?.k === 'rel' && (
        <RelationshipModal partnerName={partner.display_name} inviteCode={couple.invite_code}
                           coupleId={couple.id} userId={me.id} days={days}
                           shareEnabled={d.myStyle?.share_enabled ?? true}
                           onDone={refresh} onClose={() => setModal(null)} onDisconnect={onLeave} />
      )}
    </div>
  );
}
