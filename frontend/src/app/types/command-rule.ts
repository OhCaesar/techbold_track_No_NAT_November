export interface CommandRule {
  id: string;
  pattern: string;
  rule_type: 'whitelist' | 'blacklist';
  description: string | null;
  is_default: boolean;
  created_at: string;
}

export interface CommandRuleListResponse {
  rules: CommandRule[];
  count: number;
}

export interface CommandRuleCreate {
  pattern: string;
  rule_type: 'whitelist' | 'blacklist';
  description?: string;
}
