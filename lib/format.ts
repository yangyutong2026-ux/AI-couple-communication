/** 把时间戳写成人看的样子：刚刚 / 今天 21:40 / 9月3日 22:14 */
export function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const mins = (now.getTime() - d.getTime()) / 60000;
  const hhmm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (mins < 2) return '刚刚';
  if (d.toDateString() === now.toDateString()) return `今天 ${hhmm}`;
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hhmm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hhmm}`;
}

export function excerpt(t: string, n = 46): string {
  const s = (t || '').replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** 邀请码：去掉了容易看错的 0 O 1 I */
export function makeInviteCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return `ZJ-${s}`;
}
