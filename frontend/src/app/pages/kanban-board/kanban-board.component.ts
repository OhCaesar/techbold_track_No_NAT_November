import { KanbanSwitchToggleComponent } from '../../components/kanban-list-toggle/kanban-list-toggle.component';
import { Component, OnInit, signal } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Ticket } from '../../types/ticket';
import { CommonModule } from '@angular/common';
import { TicketService } from '../../services/ticket.service';

interface KanbanCard {
  id: number;
  company: string;
  title: string;
  priority: string;
  dueDate: string;
  count?: number;
}

interface KanbanColumn {
  label: string;
  cards: KanbanCard[];
}

@Component({
  selector: 'kanban-board',
  standalone: true,
  imports: [DragDropModule, KanbanSwitchToggleComponent, CommonModule],
  templateUrl: './kanban-board.component.html',
  styleUrls: ['./kanban-board.component.css'],
})
export class KanbanBoard implements OnInit {
  columns = signal<KanbanColumn[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  constructor(private ticketService: TicketService) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  get columnIds(): string[] {
    return this.columns().map((c) => c.label);
  }

  private loadTickets(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.ticketService.getTickets().subscribe({
      next: (response) => {
        this.columns.set(this.groupTicketsByStatus(response.tickets));
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load tickets');
        console.error('Error loading tickets:', err);
        this.isLoading.set(false);
      },
    });
  }

  private groupTicketsByStatus(tickets: Ticket[]): KanbanColumn[] {
    const statusMap: Record<string, Ticket[]> = {
      OPEN: [],
      PENDING: [],
      DONE: [],
    };

    tickets.forEach((ticket) => {
      if (ticket.status in statusMap) {
        statusMap[ticket.status].push(ticket);
      }
    });

    return [
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
  }

  private mapTicketsToCards(tickets: Ticket[]): KanbanCard[] {
    return tickets.map((ticket) => ({
      id: ticket.id,
      company: ticket.customer_name,
      title: ticket.title,
      priority: ticket.priority,
      dueDate: ticket.sla_due_at
        ? new Date(ticket.sla_due_at).toLocaleDateString('de-AT')
        : 'Kein Datum',
    }));
  }

  drop(event: CdkDragDrop<KanbanCard[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    }
  }
}
