import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TicketListResponse } from '../types/ticket';

@Injectable({
  providedIn: 'root',
})
export class TicketService {
  private apiUrl = 'http://localhost:80/api/tickets';

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

    return this.http.get<TicketListResponse>(this.apiUrl, { params });
  }
}
