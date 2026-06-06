import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionDisplayComponent } from '../execution-display/execution-display.component';

export interface ToolClaim {
  name: string;
  used: boolean;
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

  expandedThinking: { [key: string]: boolean } = {};

  messages: ChatMessage[] = [
    {
      id: '1',
      content:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.',
      thinkingProcess: 'Analyzing the API status and gathering system information...',
      toolClaims: [
        { name: 'API Check', used: true },
        { name: 'System Monitor', used: true },
        { name: 'Log Parser', used: false },
      ],
      executionApproved: true,
      shellCommand: 'curl http://localhost:8080/status',
      execution: {
        id: 'exec-1',
        type: 'SHELL',
        command: 'curl http://localhost:8080/status',
        output: '{"status":"error","code":500,"message":"Service Unavailable","uptime":"3422s"}',
        status: 'success',
        duration: 245,
        timestamp: '2024-06-06 14:32:15',
        steps: [
          { id: 'step-1', name: 'prepare ...', status: 'success', progress: 100, duration: 50 },
          { id: 'step-2', name: 'execute ...', status: 'success', progress: 100, duration: 150 },
          { id: 'step-3', name: 'parse ...', status: 'success', progress: 100, duration: 45 },
        ],
      },
    },
    {
      id: '2',
      content:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam volutua.',
    },
  ];

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
}
