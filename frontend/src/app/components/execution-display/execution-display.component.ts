import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ExecutionStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  progress?: number;
  duration?: number;
}

export interface Execution {
  id: string;
  type: 'SHELL' | 'API' | 'SCRIPT';
  command: string;
  output: string;
  status: 'running' | 'success' | 'error';
  duration?: number;
  timestamp?: string;
  steps?: ExecutionStep[];
}

@Component({
  selector: 'app-execution-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './execution-display.component.html',
  styleUrl: './execution-display.component.css',
})
export class ExecutionDisplayComponent {
  @Input() execution: Execution | null = null;

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'running':
        return '⟳';
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      default:
        return '○';
    }
  }

  getStepStatusClass(status: string): string {
    return `step-status-${status}`;
  }
}
