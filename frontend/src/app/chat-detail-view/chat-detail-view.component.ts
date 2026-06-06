import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-chat-detail-view',
  standalone: true,
  imports: [],
  templateUrl: './chat-detail-view.component.html',
  styleUrl: './chat-detail-view.component.css',
})
export class ChatDetailViewComponent {
  @Input() openChats: any[] = [];
  @Input() activeChat: any = null;
  @Output() chatSelected = new EventEmitter<any>();
  @Output() chatClosed = new EventEmitter<number>();
  @Output() newChatAdded = new EventEmitter<void>();

  selectChat(chat: any) {
    this.chatSelected.emit(chat);
  }

  closeChat(chatId: number) {
    this.chatClosed.emit(chatId);
  }

  addNewChat() {
    this.newChatAdded.emit();
  }
}
