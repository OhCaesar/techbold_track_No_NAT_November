import { ChangeDetectorRef, Component, signal, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommandRuleService } from '../../services/command-rule.service';
import { CommandRule } from '../../types/command-rule';

@Component({
  selector: 'app-command-rules-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-rules-panel.component.html',
  styleUrls: ['./command-rules-panel.component.css'],
})
export class CommandRulesPanelComponent {
  closed = output<void>();

  activeTab = signal<'whitelist' | 'blacklist'>('whitelist');
  whitelistRules = signal<CommandRule[]>([]);
  blacklistRules = signal<CommandRule[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  // Add-rule form state
  showAddForm = signal(false);
  newPattern = '';
  newDescription = '';
  addError = signal<string | null>(null);
  isAdding = signal(false);

  deletingRuleIds = signal<Record<string, boolean>>({});

  constructor(
    private ruleService: CommandRuleService,
    private cdr: ChangeDetectorRef,
  ) {
    this.loadRules();
  }

  activeRules = computed(() =>
    this.activeTab() === 'whitelist' ? this.whitelistRules() : this.blacklistRules(),
  );

  setTab(tab: 'whitelist' | 'blacklist') {
    this.activeTab.set(tab);
    this.showAddForm.set(false);
    this.addError.set(null);
  }

  loadRules() {
    this.isLoading.set(true);
    this.error.set(null);

    this.ruleService.getRules().subscribe({
      next: (response) => {
        this.whitelistRules.set(response.rules.filter((r) => r.rule_type === 'whitelist'));
        this.blacklistRules.set(response.rules.filter((r) => r.rule_type === 'blacklist'));
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error.set('Failed to load command rules');
        console.error('Error loading command rules:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  toggleAddForm() {
    this.showAddForm.set(!this.showAddForm());
    this.newPattern = '';
    this.newDescription = '';
    this.addError.set(null);
  }

  addRule() {
    if (!this.newPattern.trim()) {
      this.addError.set('Pattern is required');
      return;
    }

    this.isAdding.set(true);
    this.addError.set(null);

    this.ruleService
      .createRule({
        pattern: this.newPattern.trim(),
        rule_type: this.activeTab(),
        description: this.newDescription.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.showAddForm.set(false);
          this.newPattern = '';
          this.newDescription = '';
          this.isAdding.set(false);
          this.loadRules();
        },
        error: (err) => {
          const detail = err.error?.detail;
          this.addError.set(typeof detail === 'string' ? detail : 'Failed to add rule');
          this.isAdding.set(false);
        },
      });
  }

  deleteRule(rule: CommandRule) {
    if (this.deletingRuleIds()[rule.id]) {
      return;
    }

    this.deletingRuleIds.update((ids) => ({ ...ids, [rule.id]: true }));
    this.cdr.markForCheck();

    this.ruleService.deleteRule(rule.id).subscribe({
      next: () => {
        this.deletingRuleIds.update((ids) => {
          const next = { ...ids };
          delete next[rule.id];
          return next;
        });
        this.loadRules();
      },
      error: (err) => {
        console.error('Error deleting rule:', err);
        this.deletingRuleIds.update((ids) => {
          const next = { ...ids };
          delete next[rule.id];
          return next;
        });
        this.cdr.markForCheck();
      },
    });
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('panel-backdrop')) {
      this.closed.emit();
    }
  }

  close() {
    this.closed.emit();
  }
}
