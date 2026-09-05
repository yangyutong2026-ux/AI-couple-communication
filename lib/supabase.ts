'use client';
import { createBrowserClient } from '@supabase/ssr';

/** 浏览器里用的 Supabase 客户端。这里用的是 publishable key —— 它本来就会
 *  出现在网页源码里，安全性靠的是数据库那套 RLS 规则，不是靠藏 key。 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
