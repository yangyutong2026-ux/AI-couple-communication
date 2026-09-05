'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'up') {
        if (!name.trim()) throw new Error('还没填称呼');
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        // 账号建好了，但没拿到登录状态 —— 说明 Supabase 那边还开着邮箱验证
        if (!data.session) {
          setBusy(false);
          setErr('账号建好了，但还没能直接登录 —— Supabase 的邮箱验证开关还开着。关掉它（Authentication → Sign In / Providers → 点开 Email → Confirm email），然后用"去登录"进来。');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
    } catch (e2) {
      const m = (e2 as Error).message;
      setErr(
        /Invalid login/i.test(m) ? '邮箱或密码不对。' :
        /already registered|already been registered/i.test(m) ? '这个邮箱已经注册过了，直接登录就行。' :
        /at least 6/i.test(m) ? '密码至少 6 位。' :
        /rate limit/i.test(m) ? '注册太频繁被限流了 —— 多半是 Supabase 的邮箱验证还开着。去 Authentication → Sign In / Providers → Email 关掉 Confirm email。' :
        /Load failed|Failed to fetch|NetworkError/i.test(m) ? '没能连上服务器。可能是被限流了（Supabase 的限流响应浏览器读不到内容），也可能是网络或代理挡住了。' :
        m
      );
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brandrow">
          <div>
            <h1 className="wordmark">之间</h1>
            <div className="tagline">两个人之间，需要一个不站队的翻译者。</div>
          </div>
        </div>
        <div style={{ height: 14 }} />
      </header>

      <main>
        <div className="onb">
          <div className="step">{mode === 'up' ? '新用户' : '欢迎回来'}</div>
          <h2>{mode === 'up' ? '先说，怎么称呼你' : '登录'}</h2>
          <p>
            {mode === 'up'
              ? '这个名字只有你和另外那个人会看到。用你们平时叫彼此的那个称呼就好，不用真名。'
              : '用你注册时的邮箱登录。'}
          </p>

          <form onSubmit={submit}>
            {mode === 'up' && (
              <input type="text" placeholder="比如：阿岚" value={name}
                     onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
            )}
            <input type="email" placeholder="邮箱" value={email} required
                   onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input type="password" placeholder="密码（至少 6 位）" value={pw} required
                   onChange={(e) => setPw(e.target.value)}
                   autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />

            {err && <div className="formerr">{err}</div>}

            <button className="btn me" type="submit" disabled={busy}>
              {busy ? '稍等……' : mode === 'up' ? '创建账号' : '登录'}
            </button>
          </form>

          <button className="btn quiet" style={{ width: '100%', marginTop: 12 }}
                  onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setErr(''); }}>
            {mode === 'up' ? '已经有账号了，去登录' : '还没有账号，去注册'}
          </button>

          <div className="demoNote">
            邮箱只用来登录和找回账号。你写的日记存在数据库里，只有你自己读得到 ——
            这一条是数据库规则强制的，不是我们说了算。
          </div>
        </div>
      </main>
    </div>
  );
}
