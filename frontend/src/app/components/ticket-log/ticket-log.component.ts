import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface LogEntry {
  datetime: string;
  content: string;
  riskLevel: 'High' | 'Medium' | 'Low';
  chatMessage: string;
}

@Component({
  selector: 'app-ticket-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
        l.riskLevel.toLowerCase().includes(q) ||
        l.datetime.toLowerCase().includes(q),
    );
  }

  getRiskLevelClass(riskLevel: string): string {
    return `risk-${riskLevel.toLowerCase()}`;
  }
}
