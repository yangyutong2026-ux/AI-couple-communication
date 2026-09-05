export type Profile = { id: string; display_name: string };

export type Couple = {
  id: string;
  invite_code: string;
  member_a: string;
  member_b: string | null;
  created_at: string;
  disconnected_at: string | null;
};

export type DiaryEntry = {
  id: string;
  couple_id: string;
  author_id: string;
  body: string;
  mood: string | null;
  image_path: string | null;
  ai_readable: boolean;
  created_at: string;
};

export type Message = {
  id: string;
  couple_id: string;
  sender_id: string;
  body: string;
  ai_assisted: boolean;
  created_at: string;
};

export type AiContent =
  | { text: string }
  | { observe?: string; you?: string; them?: string; stuck?: string; draft?: string };

export type AiMessage = {
  id: string;
  couple_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: AiContent;
  created_at: string;
};

export type Grant = {
  id: string;
  couple_id: string;
  owner_id: string;
  kind: 'diary' | 'ai_thread';
  entry_id: string | null;
  snapshot: { turns: { role: string; text: string }[] } | null;
  is_open: boolean;
  created_at: string;
};
