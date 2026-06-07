import { KanbanSwitchToggleComponent } from '../../components/kanban-list-toggle/kanban-list-toggle.component';
import { Component, OnInit, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Ticket, TicketStatus } from '../../types/ticket';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TicketService } from '../../services/ticket.service';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';
import { FilterService, PriorityFilter, StatusFilter } from '../../services/filter.service';

interface KanbanCard {
  id: number;
  company: string;
  title: string;
  priority: string;
  dueDate: string;
  isOverdue: boolean;
  isUrgent: boolean;
  tags: string[];
  status: string;
  count?: number;
}

interface KanbanColumn {
  label: string;
  cards: KanbanCard[];
}

@Component({
  selector: 'kanban-board',
  standalone: true,
  imports: [
    DragDropModule,
    KanbanSwitchToggleComponent,
    CommonModule,
    RouterLink,
    SearchBarComponent,
  ],
  templateUrl: './kanban-board.component.html',
  styleUrls: ['./kanban-board.component.css'],
})
export class KanbanBoard implements OnInit {
  allTickets = signal<Ticket[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  readonly priorities: PriorityFilter[] = ['ALL', 'HIGH', 'MEDIUM', 'LOW'];
  readonly statuses: StatusFilter[] = ['ALL', 'OPEN', 'PENDING', 'DONE'];

  constructor(
    private ticketService: TicketService,
    public filterService: FilterService,
  ) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  get searchQuery(): string {
    return this.filterService.searchQuery();
  }
  set searchQuery(val: string) {
    this.filterService.searchQuery.set(val);
  }

  get selectedPriority() {
    return this.filterService.selectedPriority;
  }

  get selectedStatus() {
    return this.filterService.selectedStatus;
  }

  setPriority(priority: PriorityFilter): void {
    this.filterService.selectedPriority.set(priority);
  }

  priorityLabel(priority: PriorityFilter): string {
    return priority === 'ALL' ? 'All' : priority.charAt(0) + priority.slice(1).toLowerCase();
  }

  priorityCount(priority: PriorityFilter): number {
    const status = this.selectedStatus();
    return this.allTickets().filter(
      (ticket) =>
        (status === 'ALL' || ticket.status.toUpperCase() === status) &&
        (priority === 'ALL' || ticket.priority.toUpperCase() === priority),
    ).length;
  }

  setStatus(status: StatusFilter): void {
    this.filterService.selectedStatus.set(status);
  }

  statusLabel(status: StatusFilter): string {
    return status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase();
  }

  statusCount(status: StatusFilter): number {
    const priority = this.selectedPriority();
    return this.allTickets().filter(
      (ticket) =>
        (priority === 'ALL' || ticket.priority.toUpperCase() === priority) &&
        (status === 'ALL' || ticket.status.toUpperCase() === status),
    ).length;
  }

  get filteredColumns(): KanbanColumn[] {
    const tickets = this.allTickets();
    const q = this.searchQuery.toLowerCase().trim();
    const priority = this.selectedPriority();
    const status = this.selectedStatus();

    // 1. Filter tickets based on search query and priority
    const filteredTickets = tickets.filter((ticket) => {
      if (priority !== 'ALL' && ticket.priority.toUpperCase() !== priority) return false;
      if (!q) return true;
      return (
        ticket.title.toLowerCase().includes(q) ||
        ticket.customer_name.toLowerCase().includes(q) ||
        ticket.priority.toLowerCase().includes(q) ||
        ticket.status.toLowerCase().includes(q) ||
        (ticket.tags && ticket.tags.some((tag) => tag.toLowerCase().includes(q)))
      );
    });

    // 2. Group by status
    const statusMap: Record<TicketStatus, Ticket[]> = {
      OPEN: [],
      PENDING: [],
      DONE: [],
    };

    filteredTickets.forEach((ticket) => {
      if (ticket.status in statusMap) {
        statusMap[ticket.status].push(ticket);
      }
    });

    // 3. Build column array
    const allCols: KanbanColumn[] = [
      {
        label: 'OPEN',
        cards: this.mapTicketsToCards(statusMap['OPEN']),
      },
      {
        label: 'PENDING',
        cards: this.mapTicketsToCards(statusMap['PENDING']),
      },
      {
        label: 'DONE',
        cards: this.mapTicketsToCards(statusMap['DONE']),
      },
    ];

    // 4. Apply status filtering by restricting columns
    if (status !== 'ALL') {
      return allCols.filter((col) => col.label === status);
    }

    return allCols;
  }

  get columnIds(): string[] {
    return this.filteredColumns.map((c) => c.label);
  }

  private loadTickets(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.ticketService.getTickets().subscribe({
      next: (response) => {
        this.allTickets.set(response.tickets);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load tickets');
        console.error('Error loading tickets:', err);
        this.isLoading.set(false);
      },
    });
  }

  private mapTicketsToCards(tickets: Ticket[]): KanbanCard[] {
    const now = Date.now();
    return tickets.map((ticket) => {
      const isDone = ticket.status.toUpperCase() === 'DONE';
      const dueTime = ticket.sla_due_at ? new Date(ticket.sla_due_at).getTime() : null;
      const isOverdue = !isDone && dueTime !== null && dueTime < now;
      const isUrgent =
        !isDone && dueTime !== null && !isOverdue && dueTime - now < 2 * 60 * 60 * 1000;

      return {
        id: ticket.id,
        company: ticket.customer_name,
        title: ticket.title,
        priority: ticket.priority,
        dueDate: ticket.sla_due_at
          ? new Date(ticket.sla_due_at).toLocaleDateString('de-AT', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Kein Datum',
        isOverdue,
        isUrgent,
        tags: ticket.tags || [],
        status: ticket.status,
      };
    });
  }

  drop(event: CdkDragDrop<KanbanCard[]>): void {
    const card = event.item.data as KanbanCard;
    const previousStatus = event.previousContainer.id as TicketStatus;
    const newStatus = event.container.id as TicketStatus;

    if (previousStatus === newStatus) {
      // Reordering cards in the same column
      this.allTickets.update((tickets) => {
        const columnTickets = tickets.filter((t) => t.status === previousStatus);
        const otherTickets = tickets.filter((t) => t.status !== previousStatus);

        const reordered = [...columnTickets];
        const targetIndex = reordered.findIndex((t) => t.id === card.id);
        if (targetIndex !== -1) {
          const [moved] = reordered.splice(targetIndex, 1);
          reordered.splice(event.currentIndex, 0, moved);
        }
        return [...reordered, ...otherTickets];
      });
    } else {
      // Move card to new status
      this.allTickets.update((tickets) => {
        return tickets.map((t) => (t.id === card.id ? { ...t, status: newStatus } : t));
      });

      this.ticketService.updateStatus(card.id, newStatus).subscribe({
        error: (err) => {
          console.error('Failed to update ticket status:', err);
          // Revert on error
          this.allTickets.update((tickets) => {
            return tickets.map((t) => (t.id === card.id ? { ...t, status: previousStatus } : t));
          });
        },
      });
    }
  }
}
