import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionDisplayComponent } from '../../components/execution-display/execution-display.component';

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
  imports: [CommonModule, ExecutionDisplayComponent],
  templateUrl: './chat-detail-view.component.html',
  styleUrl: './chat-detail-view.component.css',
})
export class ChatDetailViewComponent {
  @Input() openChats: any[] = [];
  @Input() activeChat: any = null;
  @Output() chatSelected = new EventEmitter<any>();
  @Output() chatClosed = new EventEmitter<number>();
  @Output() newChatAdded = new EventEmitter<void>();
  @Output() toolCallResolved = new EventEmitter<{ toolCallId: string; approved: boolean }>();
  @Output() stopClicked = new EventEmitter<void>();
  @Output() messageSent = new EventEmitter<string>();

  expandedThinking: { [key: string]: boolean } = {};

  get chatStatus(): string {
    const s = this.activeChat?.status;
    return typeof s === 'function' ? s() : (s ?? 'running');
  }

  get canStop(): boolean {
    return ['running', 'awaiting_approval', 'idle'].includes(this.chatStatus);
  }

  get canSendMessage(): boolean {
    return this.chatStatus === 'idle';
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
