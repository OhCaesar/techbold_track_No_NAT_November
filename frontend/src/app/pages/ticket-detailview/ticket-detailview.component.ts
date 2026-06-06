import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatSelectionComponent } from '../../components/chat-selection/chat-selection.component';
import { ChatDetailViewComponent } from '../chat-detail-view/chat-detail-view.component';
import { TicketLogComponent, LogEntry } from '../../components/ticket-log/ticket-log.component';
import { TicketService } from '../../services/ticket.service';
import { Ticket } from '../../types/ticket';

@Component({
  selector: 'app-ticket-detailview',
  standalone: true,
  imports: [ChatSelectionComponent, ChatDetailViewComponent, TicketLogComponent],
  templateUrl: './ticket-detailview.component.html',
  styleUrl: './ticket-detailview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailviewComponent implements OnInit {
  showLogs = false;
  leftPanelCollapsed = false;

  ticket = signal<Ticket | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);

  constructor(
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private ticketService: TicketService,
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const ticketId = params['id'];
      if (ticketId) {
        this.loadTicket(ticketId);
      }
    });
  }

  private loadTicket(ticketId: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.ticketService.getTickets().subscribe({
      next: (response) => {
        const ticket = response.tickets.find((t) => t.id.toString() === ticketId);
        if (ticket) {
          this.ticket.set(ticket);
        } else {
          this.error.set('Ticket not found');
        }
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error.set('Failed to load ticket');
        console.error('Error loading ticket:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  availableChats = [
    {
      id: 1,
      name: 'Chatname',
      date: '12.10.2020',
      active: true,
      content:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.',
    },
    {
      id: 2,
      name: 'Chatname 2',
      date: '12.10.2020',
      active: true,
      content: 'Another chat content here with different information and context.',
    },
    {
      id: 3,
      name: 'Chatname 3',
      date: '12.10.2020',
      active: false,
      content: 'Third chat content.',
    },
  ];

  openChats: any[] = [];
  activeChat: any = null;

  logs: LogEntry[] = [
    {
      datetime: '2024-06-06 14:32:15',
      content:
        'ls -la /var/log\ntotal 256\ndrwxr-xr-x 12 root root 4096 Jun  6 14:30 .\ndrwxr-xr-x 13 root root 4096 Jun  5 10:20 ..',
      riskLevel: 'Low',
      chatMessage: 'System Check',
    },
    {
      datetime: '2024-06-06 14:28:42',
      content:
        'systemctl status nginx\n● nginx.service - A high performance web server and a reverse proxy server\n   Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)',
      riskLevel: 'Medium',
      chatMessage: 'Service Status Query',
    },
    {
      datetime: '2024-06-06 14:25:08',
      content:
        'curl http://localhost:8080/health\n{"status":"error","uptime":"3422s","timestamp":"2024-06-06T14:25:08Z"}',
      riskLevel: 'High',
      chatMessage: 'Health Check Failed',
    },
    {
      datetime: '2024-06-06 14:20:33',
      content:
        'ps aux | grep java\nroot      1234  45.2 28.3 2847392 456824 ?      Sl   13:45   2:34 java -jar app.jar',
      riskLevel: 'Low',
      chatMessage: 'Process Monitor',
    },
  ];

  toggleLogs() {
    this.showLogs = !this.showLogs;
    this.cdr.markForCheck();
  }

  onChatSelected(chat: any) {
    const existingChat = this.openChats.find((c) => c.id === chat.id);
    if (!existingChat) {
      this.openChats.push({ ...chat });
    }
    this.activeChat = this.openChats.find((c) => c.id === chat.id);
    this.cdr.markForCheck();
  }

  onChatTabSelected(chat: any) {
    this.activeChat = chat;
    this.cdr.markForCheck();
  }

  onChatClosed(chatId: number) {
    const index = this.openChats.findIndex((c) => c.id === chatId);
    if (index !== -1) {
      this.openChats.splice(index, 1);
      if (this.activeChat.id === chatId && this.openChats.length > 0) {
        this.activeChat = this.openChats[0];
      } else if (this.openChats.length === 0) {
        this.activeChat = null;
      }
    }
    this.cdr.markForCheck();
  }

  onNewChatAdded() {
    const newId = Math.max(...this.openChats.map((c) => c.id), 0) + 1;
    const newChat = {
      id: newId,
      name: `Chat ${newId}`,
      content: 'New chat content here.',
    };
    this.openChats.push(newChat);
    this.activeChat = newChat;
    this.cdr.markForCheck();
  }

  toggleLeftPanel() {
    this.leftPanelCollapsed = !this.leftPanelCollapsed;
    this.cdr.markForCheck();
  }
}
