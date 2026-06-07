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

export type ChatRunStateValue = 'running' | 'waiting_for_input' | 'completed' | 'failed';

export interface ChatRunState {
  chat_id: string;
  running: boolean;
  waiting_for_input: boolean;
  state: ChatRunStateValue;
}
