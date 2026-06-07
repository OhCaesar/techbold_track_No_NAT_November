export interface Chat {
  id: string;
  ticket_id: string;
  status: string;
  created_at: string;
}

export interface ChatListResponse {
  chats: Chat[];
  count: number;
}

export type ChatStatus = 'running' | 'waiting_on_approval' | 'stopped' | null;

export interface ChatStatusResponse {
  chat_id: string;
  status: ChatStatus;
}
