import { Routes } from '@angular/router';
import { TicketDetailviewComponent } from './ticket-detailview/ticket-detailview.component';
import { ChatList } from './pages/chat-list/chat-list';

export const routes: Routes = [
  {
    path: 'ticket-detail',
    component: TicketDetailviewComponent,
  },
  {
    path: '**',
    title: 'List chats',
    component: ChatList,
  },
];
