import { Routes } from '@angular/router';
import { TicketDetailviewComponent } from './pages/ticket-detailview/ticket-detailview.component';
import { ChatListComponent } from './pages/chat-list/chat-list.component';
import { KanbanBoardComponent } from './pages/kanban-board/kanban-board.component';

export const routes: Routes = [
  {
    path: 'kanban-board',
    title: 'Kanban Board',
    component: KanbanBoardComponent,
  },
  {
    path: 'ticket-detail',
    title: 'Ticket details',
    component: TicketDetailviewComponent,
  },
  {
    path: '**',
    title: 'List tickets',
    component: ChatListComponent,
  },
];
