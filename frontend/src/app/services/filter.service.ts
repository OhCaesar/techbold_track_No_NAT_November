import { Injectable, signal } from '@angular/core';

export type PriorityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type StatusFilter = 'ALL' | 'OPEN' | 'PENDING' | 'DONE';

@Injectable({
  providedIn: 'root',
})
export class FilterService {
  searchQuery = signal<string>('');
  selectedPriority = signal<PriorityFilter>('ALL');
  selectedStatus = signal<StatusFilter>('ALL');

  reset(): void {
    this.searchQuery.set('');
    this.selectedPriority.set('ALL');
    this.selectedStatus.set('ALL');
  }
}
