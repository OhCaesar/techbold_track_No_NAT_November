import { Routes } from '@angular/router';
import { TicketDetailviewComponent } from './ticket-detailview/ticket-detailview.component';
import { ChatList } from './pages/chat-list/chat-list';
import { KanbanBoard } from './pages/kanban-board/kanban-board';

export const routes: Routes = [
  {
    path: 'kanban-board',
    title: 'Kanban Board',
    component: KanbanBoard,
  },
  {
    path: 'ticket-detail',
    title: 'Ticket details',
    component: TicketDetailviewComponent,
  },
  {
    path: '**',
    title: 'List chats',
    component: ChatList,
  },
];
