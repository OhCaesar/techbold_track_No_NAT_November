import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-kanban-switch-toggle',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './kanban-switch-toggle.component.html',
  styleUrl: './kanban-switch-toggle.component.css',
})
export class KanbanSwitchToggleComponent {
  @Input() activeView: 'list' | 'kanban' = 'list';
}
