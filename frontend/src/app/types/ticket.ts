export type TicketStatus = 'OPEN' | 'PENDING' | 'DONE';

export interface Ticket {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: TicketStatus;
  customer_id: number;
  customer_name: string;
  tags: string[];
  sla_due_at: string | null;
  created_at: string | null;
}

export interface TicketListResponse {
  tickets: Ticket[];
  count: number;
}
