import { Routes } from '@angular/router';
import { TicketDetailviewComponent } from './pages/ticket-detailview/ticket-detailview.component';
import { TicketListComponent } from './pages/ticket-list/ticket-list.component';
import { KanbanBoard } from './pages/kanban-board/kanban-board.component';

export const routes: Routes = [
  {
    path: 'kanban-board',
    title: 'Kanban Board',
    component: KanbanBoard,
  },
  {
    path: 'ticket-detail/:id',
    title: 'Ticket details',
    component: TicketDetailviewComponent,
  },
  {
    path: '**',
    title: 'List tickets',
    component: TicketListComponent,
  },
];
