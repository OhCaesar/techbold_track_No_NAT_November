import { Component } from '@angular/core';
import { ChatListElementComponent } from '../chat-list-element/chat-list-element.component';

@Component({
  selector: 'app-ticket-detailview',
  standalone: true,
  imports: [ChatListElementComponent],
  templateUrl: './ticket-detailview.component.html',
  styleUrl: './ticket-detailview.component.css',
})
export class TicketDetailviewComponent {
  chats = [
    { name: 'Chatname', date: '12.10.2020', active: true },
    { name: 'Chatname', date: '12.10.2020', active: true },
    { name: 'Chatname', date: '12.10.2020', active: false },
  ];
}
