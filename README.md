# 之间

一个给情侣和家人用的沟通调解器。三个窗口：

- **日记本** — 只有自己看得到。AI 会读，用来理解你，但不回应。
- **共同沟通** — 两个人都看得到。AI 会读，但不插话、不评理。
- **与 AI 对话** — 只有你和 AI。它分析双方情绪背后的原因，并帮你起草要说的话。

任何要发给对方的内容，都需要你在发送前逐项授权。

## 隐私是结构性的，不是靠自觉

对方的日记原文，在**数据库层面**就读不到 —— 不是"AI 答应不引用"，是查询会被直接拒绝。
对方那边的 AI 只能读到一张单独的 `style_profiles` 表，里面是抽象过的表达习惯（比如"压力大时倾向沉默"），不含任何原文。

规则都写在 `supabase/schema.sql` 的 RLS 部分。

## 技术栈

Next.js（网页 + 服务器）· Supabase（登录 + 数据库）· Claude（分析与改写）

API key 只存在服务器端，浏览器永远拿不到。

## 本地运行

```bash
npm install
npm run dev
```

需要 `.env.local`：

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...        # 留空则 AI 回复走占位文字
```

`demo/mediator.html` 是最初的单文件原型，留作设计参考。
