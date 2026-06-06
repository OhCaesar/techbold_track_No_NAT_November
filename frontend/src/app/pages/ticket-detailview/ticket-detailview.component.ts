import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  signal,
  SecurityContext,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { ChatSelectionComponent } from '../../components/chat-selection/chat-selection.component';
import { ChatDetailViewComponent, ChatMessage } from '../chat-detail-view/chat-detail-view.component';
import { TicketLogComponent, LogEntry } from '../../components/ticket-log/ticket-log.component';
import { TicketService } from '../../services/ticket.service';
import { Ticket } from '../../types/ticket';
import { Customer } from '../../types/customer';

@Component({
  selector: 'app-ticket-detailview',
  standalone: true,
  imports: [ChatSelectionComponent, ChatDetailViewComponent, TicketLogComponent, RouterLink],
  templateUrl: './ticket-detailview.component.html',
  styleUrl: './ticket-detailview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailviewComponent implements OnInit {
  showLogs = false;
  leftPanelCollapsed = false;

  ticket = signal<Ticket | null>(null);
  customer = signal<Customer | null>(null);
  renderedDescription = signal<string>('');
  isLoading = signal(true);
  error = signal<string | null>(null);

  constructor(
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private ticketService: TicketService,
    private sanitizer: DomSanitizer,
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
          this.renderMarkdown(ticket.description);
          this.loadChats(ticketId);
        } else {
          this.error.set('Ticket not found');
          this.isLoading.set(false);
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        this.error.set('Failed to load ticket');
        console.error('Error loading ticket:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private loadChats(ticketId: string): void {
    const ticket = this.ticket();
    if (!ticket) return;

    this.ticketService.getChats(ticketId).subscribe({
      next: (response) => {
        this.availableChats = response.chats.map((chat) => {
          const chatId = chat.id.toString();
          return {
            id: chatId,
            name: `Chat ${chatId.substring(0, 7)}`,
            date: new Date(chat.created_at).toLocaleDateString('de-AT'),
            active: true,
            content: '',
          };
        });
        this.loadCustomer(ticket.customer_id);
      },
      error: (err) => {
        console.error('Error loading chats:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private loadCustomer(customerId: number): void {
    this.ticketService.getCustomer(customerId).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading customer:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private async renderMarkdown(markdown: string): Promise<void> {
    try {
      const processed = this.preprocessMarkdown(markdown);
      const html = await marked(processed);
      const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
      this.renderedDescription.set(sanitized);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error rendering markdown:', error);
      this.renderedDescription.set(markdown);
      this.cdr.markForCheck();
    }
  }

  private preprocessMarkdown(markdown: string): string {
    // Convert lines that look like commands into code blocks
    // Pattern: lines starting with sudo, apt, systemctl, curl, etc. or containing shell syntax
    const lines = markdown.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if line is a command (starts with command keywords or contains shell syntax)
      const isCommand =
        /^(sudo|apt|systemctl|curl|docker|npm|python|node|git|ls|cd|cat|echo|rm|cp|mv|chmod|chown|grep|find|sed|awk|tar|zip|unzip|wget|ssh|scp|ping|ifconfig|netstat|ps|top|htop|journalctl|tail|head|less|more|nano|vi|vim|make|gcc|gcc|go|java|ruby|perl|php|mysql|psql|mongod|redis|nginx|apache|supervisord|systemd|service|journalctl|journalctl|dmesg|uname|kernel|kernel|grub|boot|reboot|shutdown|sleep|wait|time|date|cal|history|alias|env|set|unset|export|source|bash|zsh|sh|fish|ksh|tcsh|csh)(\s|$)/i.test(
          line.trim(),
        ) ||
        /[|;&<>]{1,}/.test(line) ||
        line.trim().startsWith('./') ||
        line.trim().startsWith('/') ||
        /\$\s*\w+/.test(line); // Variable assignment or usage

      if (isCommand && line.trim().length > 0) {
        // Start a code block
        result.push('```bash');
        result.push(line);

        // Continue adding lines that are part of the same command block
        i++;
        while (
          i < lines.length &&
          lines[i].trim().length > 0 &&
          !lines[i].match(/^#{1,6}\s/) && // Not a heading
          !lines[i].match(/^\*\*\w+/) // Not bold text like **Reset**
        ) {
          const nextLine = lines[i];
          // Check if next line is also a command or output
          if (
            /^(sudo|apt|systemctl|curl|docker|npm|python|node|git|ls|cd|cat|echo|rm|cp|mv|chmod|chown|grep|find|sed|awk|tar|zip|unzip|wget|ssh|scp|ping|ifconfig|netstat|ps|top|htop|journalctl|tail|head|less|more|nano|vi|vim|make|gcc|go|java|ruby|perl|php|mysql|psql|mongod|redis|nginx|apache|supervisord|systemd|service|journalctl|dmesg|uname)(\s|$)/i.test(
              nextLine.trim(),
            ) ||
            /^(root@|[a-z]+@|\$|\#|>>>)/.test(nextLine.trim()) || // Shell prompt
            /^(total|\s+d|drwx)/.test(nextLine) || // ls output
            /^(Server|HTTP|Status|\[|{)/.test(nextLine.trim()) // Output indicators
          ) {
            result.push(nextLine);
            i++;
          } else {
            break;
          }
        }
        result.push('```');
        result.push('');
      } else {
        result.push(line);
        i++;
      }
    }

    return result.join('\n');
  }

  availableChats: any[] = [
    {
      id: '1',
      name: 'Chat 1',
      date: '12.10.2020',
      active: true,
      content:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.',
    },
    {
      id: '2',
      name: 'Chat 2',
      date: '12.10.2020',
      active: true,
      content: 'Another chat content here with different information and context.',
    },
    {
      id: '3',
      name: 'Chat 3',
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
    let existingChat = this.openChats.find((c) => c.id === chat.id);
    if (!existingChat) {
      const messages: ChatMessage[] = [];
      existingChat = {
        id: chat.id,
        name: chat.name || `Chat ${String(chat.id).substring(0, 7)}`,
        date: chat.date,
        active: chat.active,
        content: chat.content || '',
        eventSource: null as EventSource | null,
        messages,
      };
      this.openChats.push(existingChat);
    }

    // Connect to stream if not already connected
    if (!existingChat.eventSource) {
      existingChat.eventSource = this.ticketService.streamChat(chat.id);
      let currentMessageId = '';

      existingChat.eventSource.addEventListener('text_delta', (event: any) => {
        const data = JSON.parse(event.data);
        const content = data.content || '';

        if (!currentMessageId) {
          currentMessageId = Math.random().toString();
          existingChat.messages.push({
            id: currentMessageId,
            content: content,
          });
        } else {
          const lastMsg = existingChat.messages.find((m: ChatMessage) => m.id === currentMessageId);
          if (lastMsg) {
            lastMsg.content += content;
          }
        }
        this.cdr.markForCheck();
      });

      existingChat.eventSource.addEventListener('tool_call_requested', (event: any) => {
        const data = JSON.parse(event.data);
        currentMessageId = Math.random().toString();
        existingChat.messages.push({
          id: currentMessageId,
          content: `🔧 Approval needed: ${data.tool_name}\n${JSON.stringify(data.args, null, 2)}`,
        });
        this.cdr.markForCheck();
      });

      existingChat.eventSource.addEventListener('tool_result', (event: any) => {
        const data = JSON.parse(event.data);
        currentMessageId = Math.random().toString();
        existingChat.messages.push({
          id: currentMessageId,
          content: `✓ Command executed\nExit: ${data.exit_code}\nOutput: ${data.stdout || data.stderr || 'No output'}`,
        });
        this.cdr.markForCheck();
      });

      existingChat.eventSource.addEventListener('agent_completed', (event: any) => {
        const data = JSON.parse(event.data);
        currentMessageId = Math.random().toString();
        existingChat.messages.push({
          id: currentMessageId,
          content: `✅ Agent completed: ${data.summary || 'Task finished'}`,
        });
        existingChat.eventSource?.close();
        this.cdr.markForCheck();
      });

      existingChat.eventSource.addEventListener('agent_failed', (event: any) => {
        const data = JSON.parse(event.data);
        currentMessageId = Math.random().toString();
        existingChat.messages.push({
          id: currentMessageId,
          content: `❌ Agent failed: ${data.error || 'Unknown error'}`,
        });
        existingChat.eventSource?.close();
        this.cdr.markForCheck();
      });

      existingChat.eventSource.addEventListener('error', (event: Event) => {
        console.error('Stream error for chat', chat.id, 'readyState:', existingChat.eventSource?.readyState);
        existingChat.eventSource?.close();
        existingChat.messages.push({
          id: Math.random().toString(),
          content: `⚠️ Stream connection error. Check backend status.`,
        });
        this.cdr.markForCheck();
      });
    }

    this.activeChat = existingChat;
    this.cdr.markForCheck();
  }

  onChatTabSelected(chat: any) {
    this.activeChat = chat;
    this.cdr.markForCheck();
  }

  onChatClosed(chatId: string | number) {
    const index = this.openChats.findIndex((c) => c.id === chatId);
    if (index !== -1) {
      this.openChats.splice(index, 1);
      if (this.activeChat?.id === chatId && this.openChats.length > 0) {
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

  onCreateChatClicked() {
    const ticket = this.ticket();
    if (!ticket) return;

    this.ticketService.createChat(ticket.id.toString()).subscribe({
      next: (response) => {
        const messages: ChatMessage[] = [];
        const chatId = typeof response.id === 'string' ? response.id : response.id.toString();
        const newChat = {
          id: response.id,
          name: `Chat ${chatId.substring(0, 7)}`,
          date: new Date(response.created_at).toLocaleDateString('de-AT'),
          active: true,
          content: '',
          eventSource: null as EventSource | null,
          messages,
        };

        this.openChats.push(newChat);
        this.activeChat = newChat;

        // Connect to stream and handle different event types
        newChat.eventSource = this.ticketService.streamChat(response.id);

        let currentMessageId = '';

        newChat.eventSource.addEventListener('text_delta', (event: any) => {
          const data = JSON.parse(event.data);
          const content = data.content || '';

          // If we don't have a current message, create one
          if (!currentMessageId) {
            currentMessageId = Math.random().toString();
            newChat.messages.push({
              id: currentMessageId,
              content: content,
            });
          } else {
            // Append to the current message
            const lastMsg = newChat.messages.find((m: ChatMessage) => m.id === currentMessageId);
            if (lastMsg) {
              lastMsg.content += content;
            }
          }
          this.cdr.markForCheck();
        });

        newChat.eventSource.addEventListener('tool_call_requested', (event: any) => {
          const data = JSON.parse(event.data);
          currentMessageId = Math.random().toString();
          newChat.messages.push({
            id: currentMessageId,
            content: `🔧 Approval needed: ${data.tool_name}\n${JSON.stringify(data.args, null, 2)}`,
          });
          this.cdr.markForCheck();
        });

        newChat.eventSource.addEventListener('tool_result', (event: any) => {
          const data = JSON.parse(event.data);
          currentMessageId = Math.random().toString();
          newChat.messages.push({
            id: currentMessageId,
            content: `✓ Command executed\nExit: ${data.exit_code}\nOutput: ${data.stdout || data.stderr || 'No output'}`,
          });
          this.cdr.markForCheck();
        });

        newChat.eventSource.addEventListener('agent_completed', (event: any) => {
          const data = JSON.parse(event.data);
          currentMessageId = Math.random().toString();
          newChat.messages.push({
            id: currentMessageId,
            content: `✅ Agent completed: ${data.summary || 'Task finished'}`,
          });
          newChat.eventSource?.close();
          this.cdr.markForCheck();
        });

        newChat.eventSource.addEventListener('agent_failed', (event: any) => {
          const data = JSON.parse(event.data);
          currentMessageId = Math.random().toString();
          newChat.messages.push({
            id: currentMessageId,
            content: `❌ Agent failed: ${data.error || 'Unknown error'}`,
          });
          newChat.eventSource?.close();
          this.cdr.markForCheck();
        });

        newChat.eventSource.addEventListener('error', (event: Event) => {
          console.error('Stream error for chat', response.id, 'readyState:', newChat.eventSource?.readyState);
          newChat.eventSource?.close();
          newChat.messages.push({
            id: Math.random().toString(),
            content: `⚠️ Stream connection error. Check backend status.`,
          });
          this.cdr.markForCheck();
        });

        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error creating chat:', err);
      },
    });
  }

  toggleLeftPanel() {
    this.leftPanelCollapsed = !this.leftPanelCollapsed;
    this.cdr.markForCheck();
  }
}
