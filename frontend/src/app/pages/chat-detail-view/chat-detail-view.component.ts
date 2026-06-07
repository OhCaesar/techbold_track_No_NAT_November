import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionDisplayComponent } from '../../components/execution-display/execution-display.component';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

export interface ToolClaim {
  name: string;
  used: boolean;
}

export type ToolCallStatus = 'pending' | 'auto_approved' | 'approved' | 'rejected' | 'executed';

/** A backend-driven SSH tool call rendered as an interactive approval card. */
export interface ToolCallView {
  id: string;
  name: string;
  command: string;
  status: ToolCallStatus;
  output?: string;
  exitCode?: number;
  /** Short one-line reason shown as the collapsed thought-process indicator. */
  reason?: string;
  /** Full reasoning that preceded the call, shown when the element is expanded. */
  thinking?: string;
}

export interface ExecutionStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  progress?: number;
  duration?: number;
}

export interface Execution {
  id: string;
  type: 'SHELL' | 'API' | 'SCRIPT';
  command: string;
  output: string;
  status: 'running' | 'success' | 'error';
  duration?: number;
  timestamp?: string;
  steps?: ExecutionStep[];
}

export interface ChatMessage {
  id: string;
  content: string;
  thinkingProcess?: string;
  toolClaims?: ToolClaim[];
  executionApproved?: boolean;
  shellCommand?: string;
  execution?: Execution;
  toolCall?: ToolCallView;
  isUser?: boolean;
}

@Component({
  selector: 'app-chat-detail-view',
  standalone: true,
  imports: [CommonModule, ExecutionDisplayComponent, MarkdownPipe],
  templateUrl: './chat-detail-view.component.html',
  styleUrl: './chat-detail-view.component.css',
})
export class ChatDetailViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() openChats: any[] = [];
  @Input() activeChat: any = null;
  @Output() chatSelected = new EventEmitter<any>();
  @Output() chatClosed = new EventEmitter<number>();
  @Output() newChatAdded = new EventEmitter<void>();
  @Output() toolCallResolved = new EventEmitter<{ toolCallId: string; approved: boolean }>();
  @Output() stopClicked = new EventEmitter<void>();
  @Output() messageSent = new EventEmitter<string>();
  @Output() back = new EventEmitter<void>();

  @ViewChild('chatContent') private chatContent?: ElementRef<HTMLElement>;

  expandedThinking: { [key: string]: boolean } = {};

  get chatStatus(): string {
    const s = this.activeChat?.status;
    return typeof s === 'function' ? s() : (s ?? '');
  }

  get canStop(): boolean {
    return ['running', 'waiting_on_approval'].includes(this.chatStatus);
  }

  get canSendMessage(): boolean {
    return ['idle', 'stopped', 'failed'].includes(this.chatStatus) || this.chatStatus === '';
  }

  /**
   * WhatsApp-style auto-follow: stay pinned to the newest message while the user
   * is at (or near) the bottom; the moment they scroll up to read history we stop
   * following so we never yank them down, and resume once they return to bottom.
   *
   * A MutationObserver watches the chat DOM and re-pins on every content change
   * (including the word-by-word reveal), which is far more reliable than hooking
   * into Angular's change-detection lifecycle in a zoneless app.
   */
  private stickToBottom = true;
  private observer?: MutationObserver;

  ngAfterViewInit(): void {
    const el = this.chatContent?.nativeElement;
    if (!el) return;
    this.observer = new MutationObserver(() => {
      if (this.stickToBottom) this.jumpToBottom(el);
    });
    this.observer.observe(el, { childList: true, subtree: true, characterData: true });
    this.jumpToBottom(el);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Switching to another chat → start pinned to its newest message.
    if (changes['activeChat']) {
      this.stickToBottom = true;
      queueMicrotask(() => {
        const el = this.chatContent?.nativeElement;
        if (el) this.jumpToBottom(el);
      });
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** Distance from the bottom decides whether we keep auto-following. */
  onChatScroll(): void {
    const el = this.chatContent?.nativeElement;
    if (!el) return;
    this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  /** Manually scroll the chat to the newest (last) message and resume following. */
  scrollToLatest(): void {
    const el = this.chatContent?.nativeElement;
    if (!el) return;
    this.stickToBottom = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  private jumpToBottom(el: HTMLElement): void {
    el.scrollTop = el.scrollHeight;
  }

  get messages(): ChatMessage[] {
    // activeChat.messages is a signal in the live app (read it to track the
    // reactive dependency so streamed updates re-render); tests may pass a plain
    // array, so support both.
    const m = this.activeChat?.messages;
    if (typeof m === 'function') {
      return m();
    }
    return m ?? [];
  }

  /** True while the agent is actively streaming (not waiting for input / not done). */
  get loading(): boolean {
    const l = this.activeChat?.loading;
    return typeof l === 'function' ? l() : !!l;
  }

  /** Rotating "working…" text shown at the bottom while streaming. */
  get loadingText(): string {
    const t = this.activeChat?.loadingText;
    return typeof t === 'function' ? t() : (t ?? '');
  }

  /** True once the agent has reported completion. */
  get completed(): boolean {
    const c = this.activeChat?.completed;
    return typeof c === 'function' ? c() : !!c;
  }

  /** Connection placeholder shown only before the first event arrives. */
  get streamStatus(): string {
    if (this.messages.length > 0) {
      return '';
    }
    // EventSource.OPEN === 1; use the literal so this getter is safe in
    // environments without the EventSource global (e.g. unit tests / SSR).
    if (this.activeChat?.eventSource?.readyState === 1) {
      return '📡 Stream connected, waiting for agent response...';
    }
    return '⏳ Connecting to stream...';
  }

  selectChat(chat: any) {
    this.chatSelected.emit(chat);
  }

  goBack() {
    this.back.emit();
  }

  closeChat(chatId: number) {
    this.chatClosed.emit(chatId);
  }

  addNewChat() {
    this.newChatAdded.emit();
  }

  toggleThinking(messageId: string) {
    this.expandedThinking[messageId] = !this.expandedThinking[messageId];
  }

  isThinkingExpanded(messageId: string): boolean {
    return this.expandedThinking[messageId] || false;
  }

  approveExecution(messageId: string) {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      message.executionApproved = true;
    }
  }

  declineExecution(messageId: string) {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      message.executionApproved = false;
    }
  }

  /** Technician approved/rejected an SSH tool call — bubble it up to the parent. */
  resolveToolCall(toolCallId: string, approved: boolean) {
    this.toolCallResolved.emit({ toolCallId, approved });
  }

  onStop(): void {
    this.stopClicked.emit();
  }

  onSendMessage(content: string): void {
    if (!content.trim()) return;
    this.messageSent.emit(content.trim());
  }
}
