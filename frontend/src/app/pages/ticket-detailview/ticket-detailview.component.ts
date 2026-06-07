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
import { AuditLog } from '../../types/audit-log';

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
  /** Reflects the backend chat status; drives enabled/disabled state of controls. */
  status: WritableSignal<string>;
  /** True while the agent is actively streaming (drives the bottom loading text). */
  loading: WritableSignal<boolean>;
  /** Rotating "working…" text shown at the bottom while streaming. */
  loadingText: WritableSignal<string>;
  /** True once the agent has reported completion. */
  completed: WritableSignal<boolean>;
  /** Internal counter to rotate the loading text on each streamed event. */
  loadingTick: number;
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

  private mapChatListItem(chat: any) {
    const chatId = chat.id.toString();
    return {
      id: chatId,
      name: `Chat ${chatId.substring(0, 7)}`,
      date: new Date(chat.created_at).toLocaleDateString('de-AT'),
      active: true,
      content: '',
      status: chat.status,
    };
  }

  private loadChats(ticketId: string): void {
    const ticket = this.ticket();
    if (!ticket) return;

    this.ticketService.getChats(ticketId).subscribe({
      next: (response) => {
        this.availableChats.set(response.chats.map((chat) => this.mapChatListItem(chat)));
        this.loadCustomer(ticket.customer_id);
      },
      error: (err) => {
        console.error('Error loading chats:', err);
        this.isLoading.set(false);
      },
    });
  }

  /** Re-fetch the chat list (used when returning to the selection view). */
  private refreshChatList(): void {
    const ticket = this.ticket();
    if (!ticket) return;

    this.ticketService.getChats(ticket.id.toString()).subscribe({
      next: (response) => {
        this.availableChats.set(response.chats.map((chat) => this.mapChatListItem(chat)));
      },
      error: (err) => console.error('Error refreshing chat list:', err),
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

  logs = signal<LogEntry[]>([]);

  toggleLogs() {
    const next = !this.showLogs();
    this.showLogs.set(next);
    // Refresh from the backend each time the panel is opened so the technician
    // sees commands executed since it was last viewed.
    if (next) {
      this.loadAuditLogs();
    }
  }

  /** Fetch SSH audit logs for the current ticket and map them to LogEntry rows. */
  private loadAuditLogs(): void {
    const ticket = this.ticket();
    if (!ticket) return;

    this.ticketService.getAuditLogs(ticket.id.toString()).subscribe({
      next: (response) => {
        // Newest first for display.
        const logs = [...response.audit_logs]
          .sort((a, b) => +new Date(b.executed_at) - +new Date(a.executed_at))
          .map((log) => this.toLogEntry(log));
        this.logs.set(logs);
      },
      error: (err) => {
        console.error('Error loading audit logs:', err);
        this.logs.set([]);
      },
    });
  }

  private toLogEntry(log: AuditLog): LogEntry {
    const output = log.stdout?.trim() || log.stderr?.trim() || '(no output)';
    return {
      datetime: new Date(log.executed_at).toLocaleString('de-AT'),
      content: `${log.command}\n${output}`,
      riskLevel: this.riskLevelFor(log),
      chatMessage: this.statusLabelFor(log),
    };
  }

  private riskLevelFor(log: AuditLog): LogEntry['riskLevel'] {
    if (log.was_blocked) return 'High';
    if (log.exit_code !== 0) return 'Medium';
    return 'Low';
  }

  private statusLabelFor(log: AuditLog): string {
    if (log.was_blocked) return 'Blocked';
    return log.exit_code === 0
      ? `Success · ${log.duration_ms} ms`
      : `Failed (exit ${log.exit_code})`;
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
        status: signal<string>(chat.status || 'running'),
        loading: signal(false),
        loadingText: signal(''),
        completed: signal(chat.status === 'completed'),
        loadingTick: 0,
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
   * Load persisted history for a chat, then — only if the chat is still active —
   * open the SSE stream to append live events.
   *
   * A "completed"/"failed" chat is fully captured in its persisted messages, so
   * we render those and do NOT open the stream (the backend would replay its
   * buffered events and duplicate the conversation). A "running" chat hasn't had
   * its assistant narrative persisted yet, so we render the prompt from history
   * and let the stream deliver the live tokens and tool cards. For live chats we
   * skip persisted "tool" rows because the stream re-emits them as rich,
   * interactive tool-call cards.
   */
  private connectStream(chat: OpenChat): void {
    const chatId = typeof chat.id === 'string' ? chat.id : chat.id.toString();
    const isLive = chat.status() === 'running' || chat.status() === 'awaiting_approval';

    // Load old messages from /api/chats/{chatId}/messages.
    this.ticketService.getChatMessages(chatId).subscribe({
      next: (messages: any[]) => {
        console.log('📜 Loaded', messages.length, 'historical messages (live:', isLive, ')');
        chat.messages.set(this.historyToMessages(messages, isLive));
        if (isLive) {
          this.openStreamConnection(chat);
        }
      },
      error: (err) => {
        console.warn('Failed to load chat history:', err);
        // Fall back to streaming so we still show whatever the backend has buffered.
        this.openStreamConnection(chat);
      },
    });
  }

  /**
   * Convert persisted messages from /api/chats/{id}/messages into frontend
   * ChatMessage rows, rendered the SAME way the live stream renders them:
   * user/assistant become text bubbles and each "tool" message becomes an
   * interactive-style tool card (the persisted JSON carries command, output and
   * exit_code).
   *
   * When `liveStreamFollows` is true the SSE stream re-emits tool cards, so we
   * drop persisted tool rows here to avoid duplicates.
   */
  private historyToMessages(messages: any[], liveStreamFollows: boolean): ChatMessage[] {
    const out: ChatMessage[] = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        if (liveStreamFollows) continue;
        out.push(this.toolHistoryMessage(m));
      } else {
        out.push({ id: m.id || Math.random().toString(), content: m.content || '' });
      }
    }
    return out;
  }

  /** Build a tool-call card ChatMessage from a persisted "tool" result message. */
  private toolHistoryMessage(message: any): ChatMessage {
    let command = '';
    let output = message.content || '(no output)';
    let exitCode: number | undefined;
    let toolCallId = '';
    let reason = '';
    try {
      const parsed = JSON.parse(message.content);
      command = parsed.command ?? '';
      output = parsed.stdout?.trim() || parsed.stderr?.trim() || '(no output)';
      exitCode = parsed.exit_code;
      toolCallId = parsed.tool_call_id ?? '';
      reason = parsed.reason ?? '';
    } catch {
      // Leave raw content as output if it isn't JSON.
    }

    const id = toolCallId || message.id || Math.random().toString();
    return {
      id,
      content: '',
      toolCall: {
        id,
        name: 'run_ssh_command',
        command,
        status: 'executed',
        output,
        exitCode,
        reason,
        thinking: reason,
      },
    };
  }

  /** Rotating phrases for the "agent is working" indicator at the bottom of the chat. */
  private readonly loadingPhrases = [
    '🤖 Thinking…',
    '🔍 Diagnosing…',
    '⚙️ Working on it…',
    '📡 Gathering data…',
    '🧠 Reasoning…',
    '🔧 Preparing the next step…',
    '📋 Reviewing output…',
  ];

  /** Advance the loading indicator one step (a new phrase) and ensure it is shown. */
  private tickLoading(chat: OpenChat): void {
    const idx = chat.loadingTick++ % this.loadingPhrases.length;
    chat.loadingText.set(this.loadingPhrases[idx]);
    chat.loading.set(true);
  }

  private openStreamConnection(chat: OpenChat): void {
    const chatId = typeof chat.id === 'string' ? chat.id : chat.id.toString();
    const es = this.ticketService.streamChat(chatId);
    chat.eventSource = es;
    let currentMessageId = '';

    console.log(
      '🔌 openStreamConnection: opening EventSource for',
      chatId,
      'readyState:',
      es.readyState,
    );

    this.tickLoading(chat);

    es.addEventListener('text_delta', (event: any) => {
      const content = JSON.parse(event.data).content || '';
      console.log('📝 text_delta:', content.substring(0, 50));
      this.tickLoading(chat);
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
      // Pending calls need the technician's input → stop the working indicator;
      // auto-approved (read-only) calls keep working.
      if (data.auto_approved) {
        this.tickLoading(chat);
      } else {
        chat.loading.set(false);
      }
      // Skip duplicates from the replayed buffer.
      if (chat.messages().some((m) => m.toolCall?.id === data.tool_call_id)) {
        return;
      }
      chat.messages.update((msgs) => {
        // Absorb the assistant text streamed right before this call as its
        // "thought process" — it's the reasoning that led to the interaction.
        let arr = msgs;
        let thinking = '';
        const last = arr[arr.length - 1];
        if (last && !last.toolCall && last.content?.trim()) {
          thinking = last.content;
          arr = arr.slice(0, -1);
        }
        return [
          ...arr,
          {
            id: data.tool_call_id,
            content: '',
            toolCall: {
              id: data.tool_call_id,
              name: data.tool_name,
              command: data.args?.command ?? JSON.stringify(data.args ?? {}),
              status: data.auto_approved ? 'auto_approved' : 'pending',
              reason: data.args?.reason ?? '',
              thinking,
            },
          },
        ];
      });
    });

    es.addEventListener('tool_call_approved', (event: any) => {
      const data = JSON.parse(event.data);
      // Technician approved → the agent resumes working.
      this.tickLoading(chat);
      this.updateToolCall(chat, data.tool_call_id, { status: 'approved' });
    });

    es.addEventListener('tool_call_rejected', (event: any) => {
      const data = JSON.parse(event.data);
      this.tickLoading(chat);
      this.updateToolCall(chat, data.tool_call_id, { status: 'rejected' });
    });

    es.addEventListener('tool_result', (event: any) => {
      const data = JSON.parse(event.data);
      currentMessageId = '';
      this.tickLoading(chat);
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
      chat.loading.set(false);
      chat.completed.set(true);
      chat.messages.update((msgs) => [
        ...msgs,
        {
          id: Math.random().toString(),
          content: `✅ Turn completed: ${data.summary || 'Task finished'}`,
        },
      ]);
      chat.status.set('idle');
      // Stream stays open — agent_idle follows and more turns may come
    });

    es.addEventListener('agent_idle', () => {
      currentMessageId = '';
      chat.status.set('idle');
    });

    es.addEventListener('agent_stopped', () => {
      currentMessageId = '';
      chat.status.set('stopped');
      chat.messages.update((msgs) => [
        ...msgs,
        { id: Math.random().toString(), content: '🛑 Agent stopped. Type a message to restart.' },
      ]);
      // No es.close() — let the server close the stream so EventSource auto-reconnects
      // for the next agent run.
    });

    es.addEventListener('agent_failed', (event: any) => {
      const data = JSON.parse(event.data);
      currentMessageId = '';
      chat.loading.set(false);
      chat.status.set('failed');
      chat.messages.update((msgs) => [
        ...msgs,
        {
          id: Math.random().toString(),
          content: `❌ Agent failed: ${data.error || 'Unknown error'}. Type a message to retry.`,
        },
      ]);
      // No es.close() — let the server close the stream so EventSource auto-reconnects.
    });

    es.addEventListener('error', () => {
      // CONNECTING (0) = auto-reconnecting after server closed the stream — normal, ignore.
      // CLOSED (2)     = already explicitly closed — ignore.
      // OPEN (1)       = error while the stream was live — surface it to the user.
      if (es.readyState !== EventSource.OPEN) {
        return;
      }
      console.error('Stream error for chat', chat.id, 'readyState:', es.readyState);
      chat.loading.set(false);
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

    const closed = chats[index];
    closed.eventSource?.close();

    const remaining = chats.filter((c) => c.id !== chatId);
    this.openChats.set(remaining);

    if (this.activeChat()?.id === chatId) {
      this.activeChat.set(remaining.length > 0 ? remaining[0] : null);
      // Returned to the selection view → show a fresh chat list.
      if (remaining.length === 0) {
        this.refreshChatList();
      }
    }
  }

  /** Back button inside the chat detail view → return to the chat list and refresh it. */
  onBackToList() {
    this.activeChat.set(null);
    this.refreshChatList();
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
          status: signal<string>('running'),
          loading: signal(false),
          loadingText: signal(''),
          completed: signal(false),
          loadingTick: 0,
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

  onStopClicked(): void {
    const chat = this.activeChat();
    if (!chat) return;
    this.ticketService.abortChat(chat.id.toString()).subscribe({
      error: (err) => console.error('Abort failed:', err),
    });
  }

  onMessageSent(content: string): void {
    const chat = this.activeChat();
    if (!chat) return;

    // For stopped/failed chats the old EventSource was closed by the server.
    // Re-open it before calling sendMessage so the SSE subscription exists in
    // the event bus before the restarted agent task starts publishing.
    const chatStatus = chat.status();
    if (chatStatus === 'stopped' || chatStatus === 'failed') {
      if (chat.eventSource) {
        chat.eventSource.close();
      }
      this.connectStream(chat);
    }

    chat.messages.update((msgs) => [
      ...msgs,
      { id: Math.random().toString(), content: `You: ${content}`, isUser: true },
    ]);
    this.ticketService.sendMessage(chat.id.toString(), content).subscribe({
      error: (err) => console.error('Send message failed:', err),
    });
  }

  toggleLeftPanel() {
    this.leftPanelCollapsed.update((v) => !v);
  }
}
