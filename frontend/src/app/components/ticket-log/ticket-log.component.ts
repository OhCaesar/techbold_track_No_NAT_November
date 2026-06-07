import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SearchBarComponent } from '../search-bar/search-bar.component';

export interface LogEntry {
  datetime: string;
  content: string;
  wasBlocked: boolean;
  autoExecuted: boolean;
  accepted: boolean;
  chatMessage: string;
}

@Component({
  selector: 'app-ticket-log',
  standalone: true,
  imports: [CommonModule, SearchBarComponent],
  templateUrl: './ticket-log.component.html',
  styleUrl: './ticket-log.component.css',
})
export class TicketLogComponent {
  @Input() logs: LogEntry[] = [];

  searchQuery = '';

  get filteredLogs(): LogEntry[] {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.logs;
    return this.logs.filter(
      (l) =>
        l.content.toLowerCase().includes(q) ||
        l.chatMessage.toLowerCase().includes(q) ||
        l.datetime.toLowerCase().includes(q) ||
        this.getStatusLabel(l).toLowerCase().includes(q),
    );
  }

  getStatusLabel(log: LogEntry): string {
    if (log.wasBlocked) return 'Blocked';
    if (log.autoExecuted) return 'Auto Accepted';
    if (log.accepted) return 'Accepted';
    return 'Pending';
  }

  getStatusClass(log: LogEntry): string {
    if (log.wasBlocked) return 'status-blocked';
    if (log.autoExecuted) return 'status-auto';
    if (log.accepted) return 'status-accepted';
    return 'status-pending';
  }
}
