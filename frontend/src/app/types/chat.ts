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
