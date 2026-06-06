import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  signal,
  WritableSignal,
  SecurityContext,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { ChatSelectionComponent } from '../../components/chat-selection/chat-selection.component';
import {
  ChatDetailViewComponent,
  ChatMessage,
  ToolCallView,
} from '../chat-detail-view/chat-detail-view.component';
import { TicketLogComponent, LogEntry } from '../../components/ticket-log/ticket-log.component';
import { TicketService } from '../../services/ticket.service';
import { Ticket } from '../../types/ticket';
import { Customer } from '../../types/customer';

/** A chat opened in a tab, with a live SSE connection and a reactive message log. */
interface OpenChat {
  id: any;
  name: string;
  date?: string;
  active?: boolean;
  content?: string;
  eventSource: EventSource | null;
  /** Signal so SSE pushes re-render the chat view automatically (zoneless app). */
  messages: WritableSignal<ChatMessage[]>;
}

@Component({
  selector: 'app-ticket-detailview',
  standalone: true,
  imports: [ChatSelectionComponent, ChatDetailViewComponent, TicketLogComponent, RouterLink],
  templateUrl: './ticket-detailview.component.html',
  styleUrl: './ticket-detailview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailviewComponent implements OnInit {
  // All mutable template state is held in signals. This is a zoneless app, so
  // signal writes are what schedule change detection — including the streamed
  // SSE updates below. No manual markForCheck()/tick() needed.
  showLogs = signal(false);
  leftPanelCollapsed = signal(false);

  ticket = signal<Ticket | null>(null);
  customer = signal<Customer | null>(null);
  renderedDescription = signal<string>('');
  isLoading = signal(true);
  error = signal<string | null>(null);

  availableChats = signal<any[]>([]);
  openChats = signal<OpenChat[]>([]);
  activeChat = signal<OpenChat | null>(null);

  constructor(
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
        }
      },
      error: (err) => {
        this.error.set('Failed to load ticket');
        console.error('Error loading ticket:', err);
        this.isLoading.set(false);
      },
    });
  }

  private loadChats(ticketId: string): void {
    const ticket = this.ticket();
    if (!ticket) return;

    this.ticketService.getChats(ticketId).subscribe({
      next: (response) => {
        this.availableChats.set(
          response.chats.map((chat) => {
            const chatId = chat.id.toString();
            return {
              id: chatId,
              name: `Chat ${chatId.substring(0, 7)}`,
              date: new Date(chat.created_at).toLocaleDateString('de-AT'),
              active: true,
              content: '',
            };
          }),
        );
        this.loadCustomer(ticket.customer_id);
      },
      error: (err) => {
        console.error('Error loading chats:', err);
        this.isLoading.set(false);
      },
    });
  }

  private loadCustomer(customerId: number): void {
    this.ticketService.getCustomer(customerId).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading customer:', err);
        this.isLoading.set(false);
      },
    });
  }

  private async renderMarkdown(markdown: string): Promise<void> {
    try {
      const processed = this.preprocessMarkdown(markdown);
      const html = await marked(processed);
      const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
      this.renderedDescription.set(sanitized);
    } catch (error) {
      console.error('Error rendering markdown:', error);
      this.renderedDescription.set(markdown);
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
    this.showLogs.update((v) => !v);
  }

  onChatSelected(chat: any) {
    console.log('👆 Chat selected:', chat.id);
    let existingChat = this.openChats().find((c) => c.id === chat.id);
    if (!existingChat) {
      existingChat = {
        id: chat.id,
        name: chat.name || `Chat ${String(chat.id).substring(0, 7)}`,
        date: chat.date,
        active: chat.active,
        content: chat.content || '',
        eventSource: null,
        messages: signal<ChatMessage[]>([]),
      };
      const created = existingChat;
      this.openChats.update((chats) => [...chats, created]);
    }

    // Switch the view to this chat (signal write → instant re-render).
    this.activeChat.set(existingChat);

    if (!existingChat.eventSource) {
      console.log('🔌 Starting stream connection for chat:', chat.id);
      this.connectStream(existingChat);
    } else {
      console.log('✅ Stream already connected for chat:', chat.id);
    }
  }

  /**
   * Open an SSE connection for a chat and route every event type the backend
   * emits into the chat's `messages` signal. text_delta tokens accumulate into
   * the current message; tool calls become interactive approval cards. Every
   * handler writes the signal, so the zoneless app re-renders automatically.
   *
   * The backend buffers and replays all prior events on subscribe, so we connect
   * straight to /api/chats/{id}/stream — no separate history fetch needed.
   */
  private connectStream(chat: OpenChat): void {
    const chatId = typeof chat.id === 'string' ? chat.id : chat.id.toString();
    const es = this.ticketService.streamChat(chatId);
    chat.eventSource = es;
    let currentMessageId = '';

    console.log('🔌 connectStream: opening EventSource for', chatId, 'readyState:', es.readyState);

    es.addEventListener('text_delta', (event: any) => {
      const content = JSON.parse(event.data).content || '';
      console.log('📝 text_delta:', content.substring(0, 50));
      if (!currentMessageId) {
        const id = Math.random().toString();
        currentMessageId = id;
        chat.messages.update((msgs) => [...msgs, { id, content }]);
      } else {
        const id = currentMessageId;
        chat.messages.update((msgs) =>
          msgs.map((m) => (m.id === id ? { ...m, content: m.content + content } : m)),
        );
      }
    });

    es.addEventListener('tool_call_requested', (event: any) => {
      const data = JSON.parse(event.data);
      console.log('🔧 tool_call_requested:', data.tool_name, data.tool_call_id);
      currentMessageId = '';
      // Skip duplicates from the replayed buffer.
      if (chat.messages().some((m) => m.toolCall?.id === data.tool_call_id)) {
        return;
      }
      chat.messages.update((msgs) => [
        ...msgs,
        {
          id: data.tool_call_id,
          content: '',
          toolCall: {
            id: data.tool_call_id,
            name: data.tool_name,
            command: data.args?.command ?? JSON.stringify(data.args ?? {}),
            status: data.auto_approved ? 'auto_approved' : 'pending',
          },
        },
      ]);
    });

    es.addEventListener('tool_call_approved', (event: any) => {
      const data = JSON.parse(event.data);
      this.updateToolCall(chat, data.tool_call_id, { status: 'approved' });
    });

    es.addEventListener('tool_call_rejected', (event: any) => {
      const data = JSON.parse(event.data);
      this.updateToolCall(chat, data.tool_call_id, { status: 'rejected' });
    });

    es.addEventListener('tool_result', (event: any) => {
      const data = JSON.parse(event.data);
      currentMessageId = '';
      this.updateToolCall(chat, data.tool_call_id, {
        status: 'executed',
        output: data.stdout || data.stderr || '(no output)',
        exitCode: data.exit_code,
      });
    });

    es.addEventListener('agent_completed', (event: any) => {
      const data = JSON.parse(event.data);
      console.log('✅ agent_completed:', data.summary);
      currentMessageId = '';
      chat.messages.update((msgs) => [
        ...msgs,
        {
          id: Math.random().toString(),
          content: `✅ Agent completed: ${data.summary || 'Task finished'}`,
        },
      ]);
      es.close();
    });

    es.addEventListener('agent_failed', (event: any) => {
      const data = JSON.parse(event.data);
      currentMessageId = '';
      chat.messages.update((msgs) => [
        ...msgs,
        {
          id: Math.random().toString(),
          content: `❌ Agent failed: ${data.error || 'Unknown error'}`,
        },
      ]);
      es.close();
    });

    es.addEventListener('error', () => {
      // EventSource fires 'error' on normal close too; only surface it while connecting/open.
      if (es.readyState === EventSource.CLOSED) {
        return;
      }
      console.error('Stream error for chat', chat.id, 'readyState:', es.readyState);
      es.close();
      chat.messages.update((msgs) => [
        ...msgs,
        {
          id: Math.random().toString(),
          content: `⚠️ Stream connection error. Check backend status.`,
        },
      ]);
    });
  }

  /** Merge updated fields into a chat's tool-call message (immutably) and re-render. */
  private updateToolCall(chat: OpenChat, toolCallId: string, patch: Partial<ToolCallView>): void {
    chat.messages.update((msgs) =>
      msgs.map((m) =>
        m.toolCall?.id === toolCallId ? { ...m, toolCall: { ...m.toolCall, ...patch } } : m,
      ),
    );
  }

  /** Technician clicked ACCEPT/DECLINE on a tool-call card. */
  onToolCallResolved(event: { toolCallId: string; approved: boolean }): void {
    const chat = this.activeChat();
    if (!chat) return;
    const chatId = typeof chat.id === 'string' ? chat.id : chat.id.toString();

    // Optimistically reflect the decision; the SSE tool_call_approved/rejected
    // event will confirm it, and tool_result will follow with the output.
    this.updateToolCall(chat, event.toolCallId, {
      status: event.approved ? 'approved' : 'rejected',
    });

    this.ticketService.resolveToolCall(chatId, event.toolCallId, event.approved).subscribe({
      error: (err) => {
        console.error('Failed to resolve tool call:', err);
        // Revert to pending so the technician can retry.
        this.updateToolCall(chat, event.toolCallId, { status: 'pending' });
      },
    });
  }

  onChatTabSelected(chat: OpenChat) {
    this.activeChat.set(chat);
  }

  onChatClosed(chatId: string | number) {
    const chats = this.openChats();
    const index = chats.findIndex((c) => c.id === chatId);
    if (index === -1) return;

    const remaining = chats.filter((c) => c.id !== chatId);
    this.openChats.set(remaining);

    if (this.activeChat()?.id === chatId) {
      this.activeChat.set(remaining.length > 0 ? remaining[0] : null);
    }
  }

  onNewChatAdded() {
    this.onCreateChatClicked();
  }

  onCreateChatClicked() {
    const ticket = this.ticket();
    if (!ticket) return;

    this.ticketService.createChat(ticket.id.toString()).subscribe({
      next: (response) => {
        const chatId = typeof response.id === 'string' ? response.id : response.id.toString();
        const newChat: OpenChat = {
          id: response.id,
          name: `Chat ${chatId.substring(0, 7)}`,
          date: new Date(response.created_at).toLocaleDateString('de-AT'),
          active: true,
          content: '',
          eventSource: null,
          messages: signal<ChatMessage[]>([]),
        };

        this.openChats.update((chats) => [...chats, newChat]);
        this.activeChat.set(newChat);
        console.log('✅ Chat created, activeChat set:', newChat.id);

        console.log('🔌 Starting stream connection');
        this.connectStream(newChat);
      },
      error: (err) => {
        console.error('Error creating chat:', err);
      },
    });
  }

  toggleLeftPanel() {
    this.leftPanelCollapsed.update((v) => !v);
  }
}
