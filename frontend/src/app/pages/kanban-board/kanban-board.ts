import { Component } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';

interface KanbanCard {
  id: number;
  company: string;
  title: string;
  priority: string;
  dueDate: string;
  count?: number;
}

interface KanbanColumn {
  label: string;
  cards: KanbanCard[];
}

@Component({
  selector: 'kanban-board',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './kanban-board.html',
  styleUrls: ['./kanban-board.css'],
})
export class KanbanBoard {
  get columnIds(): string[] {
    return this.columns.map((c) => c.label);
  }

  drop(event: CdkDragDrop<KanbanCard[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    }
  }

  columns: KanbanColumn[] = [
    {
      label: 'OPEN',
      cards: [
        {
          id: 1,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'MEDIUM',
          dueDate: 'X.X.XXX',
        },
        {
          id: 2,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'EASY',
          dueDate: 'X.X.XXX',
        },
        {
          id: 3,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'EASY',
          dueDate: 'X.X.XXX',
        },
      ],
    },
    {
      label: 'In Progress',
      cards: [
        {
          id: 4,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'HIGH',
          dueDate: 'X.X.XXX',
          count: 5,
        },
      ],
    },
    {
      label: 'Done',
      cards: [
        {
          id: 5,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'HIGH',
          dueDate: 'X.X.XXX',
          count: 5,
        },
        {
          id: 6,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'MEDIUM',
          dueDate: 'X.X.XXX',
        },
        {
          id: 7,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'EASY',
          dueDate: 'X.X.XXX',
        },
        {
          id: 8,
          company: 'Nordlicht Logistik GmbH',
          title: 'Status API intermittently unavailable',
          priority: 'EASY',
          dueDate: 'X.X.XXX',
        },
      ],
    },
  ];
}
