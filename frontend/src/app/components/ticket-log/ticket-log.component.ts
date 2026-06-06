import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LogEntry {
  datetime: string;
  content: string;
  riskLevel: 'High' | 'Medium' | 'Low';
  chatMessage: string;
}

@Component({
  selector: 'app-ticket-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-log.component.html',
  styleUrl: './ticket-log.component.css',
})
export class TicketLogComponent {
  @Input() logs: LogEntry[] = [];

  getRiskLevelClass(riskLevel: string): string {
    return `risk-${riskLevel.toLowerCase()}`;
  }
}
