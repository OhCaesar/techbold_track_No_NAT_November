import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ChatListElementComponent } from '../chat-list-element/chat-list-element.component';

@Component({
  selector: 'app-chat-selection',
  standalone: true,
  imports: [ChatListElementComponent],
  templateUrl: './chat-selection.component.html',
  styleUrl: './chat-selection.component.css',
})
export class ChatSelectionComponent {
  @Input() availableChats: any[] = [];
  @Output() chatSelected = new EventEmitter<any>();
  @Output() createChatClicked = new EventEmitter<void>();

  selectChat(chat: any) {
    this.chatSelected.emit(chat);
  }

  onCreateChatClick() {
    this.createChatClicked.emit();
  }
}
