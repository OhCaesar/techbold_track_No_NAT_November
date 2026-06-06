import {Component} from '@angular/core';
import {NgFor} from '@angular/common';

@Component({
  selector: 'chat-list',
  standalone: true,
  imports: [NgFor],
  templateUrl: './chat-list.html',
  styleUrls: ['./chat-list.css']
})
export class ChatList {
  items = [
    { company: 'Nordlicht Logistik GmbH', title: 'Status API intermittently unavailable', priority: 'HIGH', dueDate: 'X.X.XXX', tags: ['Due', 'Due', 'Due'], count: 5 },
    { company: 'Nordlicht Logistik GmbH', title: 'Status API intermittently unavailable', priority: 'HIGH', dueDate: 'X.X.XXX', tags: ['Due', 'Due', 'Due'], count: 5 },
    { company: 'Nordlicht Logistik GmbH', title: 'Status API intermittently unavailable', priority: 'HIGH', dueDate: 'X.X.XXX', tags: ['Due', 'Due', 'Due'], count: 5 },
    { company: 'Nordlicht Logistik GmbH', title: 'Status API intermittently unavailable', priority: 'HIGH', dueDate: 'X.X.XXX', tags: ['Due', 'Due', 'Due'], count: 5 },
    { company: 'Nordlicht Logistik GmbH', title: 'Status API intermittently unavailable', priority: 'HIGH', dueDate: 'X.X.XXX', tags: ['Due', 'Due', 'Due'], count: 5 },
  ];
}
