import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { KanbanSwitchToggleComponent } from '../../components/kanban-list-toggle/kanban-list-toggle.component';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { TicketService } from '../../services/ticket.service';
import { Ticket } from '../../types/ticket';

type PriorityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
type StatusFilter = 'ALL' | 'OPEN' | 'PENDING' | 'DONE';
type SortField = 'name' | 'company' | 'priority' | 'status' | 'dueDate' | 'createdDate' | 'tags';
type SortDir = 'asc' | 'desc';

interface ListItem {
  id: number;
  company: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string;
  dueDateRaw: number | null;
  createdRaw: number | null;
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
  /**
   * Full ticket list, fetched once. Filtering, sorting and search are all applied
   * client-side (see `filteredItems`). The ERP's query params are not used for
   * this because it rejects the `sort` param (422) and mishandles combined
   * status+priority filters — client-side is correct for every combination.
   */
  items = signal<ListItem[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';

  readonly priorities: PriorityFilter[] = ['ALL', 'HIGH', 'MEDIUM', 'LOW'];
  selectedPriority = signal<PriorityFilter>('ALL');

  readonly statuses: StatusFilter[] = ['ALL', 'OPEN', 'PENDING', 'DONE'];
  selectedStatus = signal<StatusFilter>('ALL');

  readonly sortFields: { value: SortField; label: string }[] = [
    { value: 'createdDate', label: 'Created date' },
    { value: 'dueDate', label: 'Due date' },
    { value: 'name', label: 'Name' },
    { value: 'company', label: 'Company' },
    { value: 'priority', label: 'Priority' },
    { value: 'status', label: 'Status' },
    { value: 'tags', label: 'Tags' },
  ];
  sortField = signal<SortField>('createdDate');
  sortDir = signal<SortDir>('desc');

  constructor(private ticketService: TicketService) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  /** Apply priority + status filters, the text search, then the active sort. */
  get filteredItems(): ListItem[] {
    const q = this.searchQuery.toLowerCase().trim();
    const priority = this.selectedPriority();
    const status = this.selectedStatus();

    const filtered = this.items().filter((item) => {
      if (priority !== 'ALL' && item.priority.toUpperCase() !== priority) return false;
      if (status !== 'ALL' && item.status.toUpperCase() !== status) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        item.priority.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const field = this.sortField();
    return [...filtered].sort((a, b) => dir * this.compareItems(a, b, field));
  }

  private compareItems(a: ListItem, b: ListItem, field: SortField): number {
    switch (field) {
      case 'name':
        return a.title.localeCompare(b.title);
      case 'company':
        return a.company.localeCompare(b.company);
      case 'priority':
        return this.priorityRank(a.priority) - this.priorityRank(b.priority);
      case 'status':
        return this.statusRank(a.status) - this.statusRank(b.status);
      case 'dueDate':
        // Tickets without a due date sort last (treated as far future).
        return (a.dueDateRaw ?? Infinity) - (b.dueDateRaw ?? Infinity);
      case 'createdDate':
        return (a.createdRaw ?? 0) - (b.createdRaw ?? 0);
      case 'tags':
        return a.tags.join(', ').localeCompare(b.tags.join(', '));
      default:
        return 0;
    }
  }

  private priorityRank(priority: string): number {
    return { LOW: 1, MEDIUM: 2, HIGH: 3 }[priority.toUpperCase()] ?? 0;
  }

  private statusRank(status: string): number {
    return { OPEN: 1, PENDING: 2, DONE: 3 }[status.toUpperCase()] ?? 0;
  }

  setPriority(priority: PriorityFilter): void {
    this.selectedPriority.set(priority);
  }

  priorityLabel(priority: PriorityFilter): string {
    return priority === 'ALL' ? 'All' : priority.charAt(0) + priority.slice(1).toLowerCase();
  }

  /** Count of tickets of a given priority within the active status filter. */
  priorityCount(priority: PriorityFilter): number {
    const status = this.selectedStatus();
    return this.items().filter(
      (item) =>
        (status === 'ALL' || item.status.toUpperCase() === status) &&
        (priority === 'ALL' || item.priority.toUpperCase() === priority),
    ).length;
  }

  setStatus(status: StatusFilter): void {
    this.selectedStatus.set(status);
  }

  statusLabel(status: StatusFilter): string {
    return status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase();
  }

  /** Count of tickets of a given status within the active priority filter. */
  statusCount(status: StatusFilter): number {
    const priority = this.selectedPriority();
    return this.items().filter(
      (item) =>
        (priority === 'ALL' || item.priority.toUpperCase() === priority) &&
        (status === 'ALL' || item.status.toUpperCase() === status),
    ).length;
  }

  setSortField(field: SortField): void {
    this.sortField.set(field);
  }

  toggleSortDir(): void {
    this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
  }

  private loadTickets(): void {
    this.isLoading.set(true);
    this.error.set(null);

    forkJoin({
      tickets: this.ticketService.getTickets(),
      chats: this.ticketService.getAllChats(),
    }).subscribe({
      next: ({ tickets, chats }) => {
        const chatCounts = new Map<string, number>();
        for (const chat of chats.chats) {
          chatCounts.set(chat.ticket_id, (chatCounts.get(chat.ticket_id) ?? 0) + 1);
        }
        this.items.set(this.mapTicketsToListItems(tickets.tickets, chatCounts));
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load tickets');
        console.error('Error loading tickets:', err);
        this.isLoading.set(false);
      },
    });
  }

  private mapTicketsToListItems(tickets: Ticket[], chatCounts: Map<string, number>): ListItem[] {
    return tickets.map((ticket) => ({
      id: ticket.id,
      company: ticket.customer_name,
      title: ticket.title,
      priority: ticket.priority,
      status: ticket.status,
      dueDate: ticket.sla_due_at
        ? new Date(ticket.sla_due_at).toLocaleDateString('de-AT')
        : 'No Date',
      dueDateRaw: ticket.sla_due_at ? new Date(ticket.sla_due_at).getTime() : null,
      createdRaw: ticket.created_at ? new Date(ticket.created_at).getTime() : null,
      tags: ticket.tags,
      count: chatCounts.get(ticket.id.toString()) ?? 0,
    }));
  }
}
