import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-chat-list-element',
  standalone: true,
  imports: [],
  templateUrl: './chat-list-element.component.html',
  styleUrl: './chat-list-element.component.css',
})
export class ChatListElementComponent {
  @Input() chatName: string = 'CHAT';
  @Input() chatDate: string = '12.12.1212';
  @Input() active: boolean = true;
  /** Live run-state: "running" | "waiting_for_input" | "completed" | "failed". */
  @Input() state: string = '';

  get isRunning(): boolean {
    return this.state === 'running';
  }

  get isWaiting(): boolean {
    return this.state === 'waiting_for_input';
  }

  get isCompleted(): boolean {
    return this.state === 'completed';
  }

  get isFailed(): boolean {
    return this.state === 'failed';
  }
}
