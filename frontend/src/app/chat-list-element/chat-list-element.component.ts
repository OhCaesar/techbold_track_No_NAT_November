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
}
