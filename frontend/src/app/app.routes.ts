import { Routes } from '@angular/router';
import { ChatList } from './pages/chat-list/chat-list';

export const routes: Routes = [
  {
    path: '**',
    title: 'List chats',
    component: ChatList,
  },
];
