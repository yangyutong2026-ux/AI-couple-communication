'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Auth from '@/components/Auth';
import Pairing from '@/components/Pairing';
import Promises from '@/components/Promises';
import AppShell from '@/components/AppShell';
import type { Couple, Profile } from '@/lib/types';

export default function Page() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [couple, setCouple] = useState<Couple | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [seenPromises, setSeenPromises] = useState(true);

  /** 把"我是谁、我和谁在一起"这两件事重新读一遍 */
  const load = useCallback(async (uid: string) => {
    const { data: c } = await supabase
      .from('couples')
      .select('*')
      .is('disconnected_at', null)
      .or(`member_a.eq.${uid},member_b.eq.${uid}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setCouple((c as Couple) ?? null);

    const ids = [uid, c?.member_a, c?.member_b].filter(Boolean) as string[];
    const { data: ps } = await supabase.from('profiles').select('*').in('id', ids);
    const list = (ps ?? []) as Profile[];
    setMe(list.find((p) => p.id === uid) ?? null);

    const pid = c ? (c.member_a === uid ? c.member_b : c.member_a) : null;
    setPartner(pid ? list.find((p) => p.id === pid) ?? null : null);

    if (c?.id) setSeenPromises(localStorage.getItem('zj_promises_' + c.id) === '1');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) load(uid).then(() => setReady(true));
      else setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (uid) load(uid);
      else { setCouple(null); setMe(null); setPartner(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(() => { if (userId) load(userId); }, [userId, load]);

  if (!ready) return <div className="app"><main><div className="empty">正在打开……</div></main></div>;
  if (!userId) return <Auth />;
  if (!couple || !couple.member_b) return <Pairing userId={userId} couple={couple} onChange={refresh} />;
  if (!seenPromises)
    return (
      <Promises
        partner={partner?.display_name || '对方'}
        onDone={() => { localStorage.setItem('zj_promises_' + couple.id, '1'); setSeenPromises(true); }}
      />
    );

  if (!me || !partner) return <div className="app"><main><div className="empty">正在读取……</div></main></div>;

  return <AppShell couple={couple} me={me} partner={partner} onLeave={refresh} />;
}
