import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Ticket, TicketListResponse, TicketStatus } from '../types/ticket';
import { ChatListResponse } from '../types/chat';
import { Customer } from '../types/customer';

@Injectable({
  providedIn: 'root',
})
export class TicketService {
  private apiUrl = 'http://localhost/api/tickets';
  private chatsUrl = 'http://localhost/api/chats';
  private customersUrl = 'http://localhost/api/customers';

  constructor(private http: HttpClient) {}

  getTickets(options?: {
    status?: string;
    priority?: string;
    sort?: string;
  }): Observable<TicketListResponse> {
    let params = new HttpParams();

    if (options?.status) {
      params = params.set('status', options.status);
    }
    if (options?.priority) {
      params = params.set('priority', options.priority);
    }
    if (options?.sort) {
      params = params.set('sort', options.sort);
    }

    console.log('Fetching tickets from:', this.apiUrl);
    return this.http.get<TicketListResponse>(this.apiUrl, { params });
  }

  updateStatus(ticketId: number, status: TicketStatus): Observable<Ticket> {
    return this.http.patch<Ticket>(`${this.apiUrl}/${ticketId}/status`, { status });
  }

  getChats(ticketId: string): Observable<ChatListResponse> {
    const params = new HttpParams().set('ticket_id', ticketId);
    return this.http.get<ChatListResponse>(this.chatsUrl, { params });
  }

  getCustomer(customerId: number): Observable<Customer> {
    return this.http.get<Customer>(`${this.customersUrl}/${customerId}`);
  }

  createChat(ticketId: string): Observable<any> {
    return this.http.post(this.chatsUrl, { ticket_id: ticketId });
  }

  streamChat(chatId: string | object): EventSource {
    const id = typeof chatId === 'string' ? chatId : (chatId as any).id;
    return new EventSource(`http://localhost/api/chats/${id}/stream`);
  }

  /** Approve or reject a pending tool call awaiting technician sign-off. */
  resolveToolCall(chatId: string, toolCallId: string, approved: boolean): Observable<any> {
    return this.http.patch(`${this.chatsUrl}/${chatId}/tool-calls/${toolCallId}`, { approved });
  }
}
