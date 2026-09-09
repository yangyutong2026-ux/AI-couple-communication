'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { makeInviteCode } from '@/lib/format';
import { Icon } from './Icons';
import type { Couple } from '@/lib/types';

type Props = {
  userId: string;
  couple: Couple | null;
  onChange: () => void;
};

export default function Pairing({ userId, couple, onChange }: Props) {
  const [pick, setPick] = useState<'none' | 'join'>('none');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const waiting = !!couple && !couple.member_b;

  // 等对方输码的时候，每 4 秒看一眼有没有人进来
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(onChange, 4000);
    return () => clearInterval(t);
  }, [waiting, onChange]);

  async function create() {
    setBusy(true); setErr('');
    const { error } = await supabase.from('couples').insert({
      invite_code: makeInviteCode(),
      member_a: userId,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    onChange();
    setBusy(false);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('join_couple', { code: code.trim().toUpperCase() });
    if (error) {
      setErr(/无效|invalid/i.test(error.message) ? '这个邀请码用不了 —— 可能填错了，或者对方已经和别人连上了。' : error.message);
      setBusy(false);
      return;
    }
    onChange();
    setBusy(false);
  }

  // ---- 等对方接受 ----
  if (waiting) {
    return (
      <Shell step="第 2 步 / 共 2 步" title="把这串码发给对方">
        <p>「之间」一个人用不起来。对方注册之后输入这串码，你们才算连上 —— 在那之前，你写的任何东西都不会去到任何地方。</p>
        <div className="code">{couple!.invite_code}</div>
        <button className="btn ghost" onClick={() => {
          navigator.clipboard?.writeText(couple!.invite_code);
          setCopied(true); setTimeout(() => setCopied(false), 1400);
        }}>{copied ? '已复制' : '复制邀请码'}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--ink-3)', fontSize: 13, margin: '20px 0 0' }}>
          <span className="pulsedot" />正在等待对方输入……
        </div>
        <div className="demoNote">这一页会自己刷新，对方一填码就会跳过去。你可以先关掉，等TA弄好再回来。</div>
      </Shell>
    );
  }

  // ---- 输入别人给的码 ----
  if (pick === 'join') {
    return (
      <Shell step="加入" title="填入对方给你的邀请码">
        <p>六位字母数字，长得像 ZJ-4K9T。大小写都行。</p>
        <form onSubmit={join}>
          <input type="text" placeholder="ZJ-XXXXXX" value={code}
                 onChange={(e) => setCode(e.target.value)} style={{ fontFamily: 'var(--mono)', letterSpacing: '.12em' }} />
          {err && <div className="formerr">{err}</div>}
          <button className="btn me" type="submit" disabled={busy}>{busy ? '连接中……' : '连接'}</button>
        </form>
        <button className="btn quiet" style={{ width: '100%', marginTop: 12 }} onClick={() => { setPick('none'); setErr(''); }}>
          返回
        </button>
      </Shell>
    );
  }

  // ---- 选一条路 ----
  return (
    <Shell step="第 1 步 / 共 2 步" title="你和谁一起用">
      <p>「之间」只在两个人之间成立。你可以发起一段关系，也可以用对方给你的码加进来。</p>
      <div className="promise">{Icon.two}<div>
        <div className="pt">我来发起</div>
        <div className="pd">生成一串邀请码发给对方，TA填进去你们就连上了。</div>
      </div></div>
      <button className="btn me" onClick={create} disabled={busy} style={{ marginBottom: 22 }}>
        {busy ? '稍等……' : '生成邀请码'}
      </button>
      <div className="promise">{Icon.send}<div>
        <div className="pt">我收到了邀请码</div>
        <div className="pd">对方已经发起了，你只要把码填进去。</div>
      </div></div>
      <button className="btn ghost" onClick={() => setPick('join')}>填入邀请码</button>
      {err && <div className="formerr">{err}</div>}
    </Shell>
  );
}

function Shell({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <div className="seal" aria-hidden="true"><span>之</span><span>间</span></div>
          <div>
            <h1 className="wordmark">之间</h1>
            <div className="tagline">两个人之间，需要一个不站队的翻译者。</div>
          </div>
          <div className="topright">
            <button className="iconbtn" title="退出登录" aria-label="退出登录"
                    onClick={() => supabase.auth.signOut()}>↩</button>
          </div>
        </div>
        <div style={{ height: 14 }} />
      </header>
      <main>
        <div className="onb">
          <div className="step">{step}</div>
          <h2>{title}</h2>
          {children}
        </div>
      </main>
    </div>
  );
}
