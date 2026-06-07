import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { KanbanSwitchToggleComponent } from '../../components/kanban-list-toggle/kanban-list-toggle.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { TicketService } from '../../services/ticket.service';
import { Ticket } from '../../types/ticket';

interface ListItem {
  id: number;
  company: string;
  title: string;
  priority: string;
  dueDate: string;
  tags: string[];
  count?: number;
}

@Component({
  selector: 'ticket-list',
  standalone: true,
  imports: [RouterLink, KanbanSwitchToggleComponent, CommonModule, SearchBarComponent],
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.css'],
})
export class TicketListComponent implements OnInit {
  items = signal<ListItem[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';

  get filteredItems(): ListItem[] {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.items();
    return this.items().filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        item.priority.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  constructor(private ticketService: TicketService) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  private loadTickets(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.ticketService.getTickets().subscribe({
      next: (response) => {
        this.items.set(this.mapTicketsToListItems(response.tickets));
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load tickets');
        console.error('Error loading tickets:', err);
        this.isLoading.set(false);
      },
    });
  }

  private mapTicketsToListItems(tickets: Ticket[]): ListItem[] {
    return tickets.map((ticket) => ({
      id: ticket.id,
      company: ticket.customer_name,
      title: ticket.title,
      priority: ticket.priority,
      dueDate: ticket.sla_due_at
        ? new Date(ticket.sla_due_at).toLocaleDateString('de-AT')
        : 'No Date',
      tags: ticket.tags,
    }));
  }
}
