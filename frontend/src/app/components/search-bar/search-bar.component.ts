import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.css',
})
export class SearchBarComponent {
  @Input() placeholder = 'Search…';
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  onInput(val: string) {
    this.value = val;
    this.valueChange.emit(val);
  }
}
