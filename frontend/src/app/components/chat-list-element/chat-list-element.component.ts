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
  /** Live status: "running" | "waiting_on_approval" | "stopped" | null */
  @Input() state: string | null = null;

  get isRunning(): boolean {
    return this.state === 'running';
  }

  get isWaiting(): boolean {
    return this.state === 'waiting_on_approval';
  }

  get isStopped(): boolean {
    return this.state === 'stopped';
  }
}
