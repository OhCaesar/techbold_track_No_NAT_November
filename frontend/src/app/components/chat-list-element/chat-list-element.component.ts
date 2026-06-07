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
  /** Backend chat status: "running" | "awaiting_approval" | "completed" | "failed". */
  @Input() status: string = '';

  get isCompleted(): boolean {
    return this.status === 'completed';
  }

  get isFailed(): boolean {
    return this.status === 'failed';
  }
}
