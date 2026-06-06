import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KanbanSwitchToggleComponent } from '../../components/kanban-list-toggle/kanban-switch-toggle.component';

@Component({
  selector: 'ticket-list',
  standalone: true,
  imports: [RouterLink, KanbanSwitchToggleComponent],
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.css'],
})
export class TicketListComponent {
  items = [
    {
      id: 1,
      company: 'Nordlicht Logistik GmbH',
      title: 'Status API intermittently unavailable',
      priority: 'HIGH',
      dueDate: 'X.X.XXX',
      tags: ['Due', 'Due', 'Due'],
      count: 5,
    },
    {
      id: 2,
      company: 'Nordlicht Logistik GmbH',
      title: 'Status API intermittently unavailable',
      priority: 'HIGH',
      dueDate: 'X.X.XXX',
      tags: ['Due', 'Due', 'Due'],
      count: 5,
    },
    {
      id: 3,
      company: 'Nordlicht Logistik GmbH',
      title: 'Status API intermittently unavailable',
      priority: 'HIGH',
      dueDate: 'X.X.XXX',
      tags: ['Due', 'Due', 'Due'],
      count: 5,
    },
    {
      id: 4,
      company: 'Nordlicht Logistik GmbH',
      title: 'Status API intermittently unavailable',
      priority: 'HIGH',
      dueDate: 'X.X.XXX',
      tags: ['Due', 'Due', 'Due'],
      count: 5,
    },
    {
      id: 5,
      company: 'Nordlicht Logistik GmbH',
      title: 'Status API intermittently unavailable',
      priority: 'HIGH',
      dueDate: 'X.X.XXX',
      tags: ['Due', 'Due', 'Due'],
      count: 5,
    },
  ];
}
