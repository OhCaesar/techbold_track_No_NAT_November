import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommandRulesPanelComponent } from './components/command-rules-panel/command-rules-panel.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommandRulesPanelComponent],
  templateUrl: './app.html',
})
export class App {
  showCommandRules = signal(false);

  toggleCommandRules() {
    this.showCommandRules.set(!this.showCommandRules());
  }
}
