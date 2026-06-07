import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CommandRule, CommandRuleCreate, CommandRuleListResponse } from '../types/command-rule';

@Injectable({
  providedIn: 'root',
})
export class CommandRuleService {
  private apiUrl = 'http://localhost/api/command-rules';

  constructor(private http: HttpClient) {}

  getRules(ruleType?: 'whitelist' | 'blacklist'): Observable<CommandRuleListResponse> {
    let params = new HttpParams();
    if (ruleType) {
      params = params.set('rule_type', ruleType);
    }
    return this.http.get<CommandRuleListResponse>(this.apiUrl, { params });
  }

  createRule(rule: CommandRuleCreate): Observable<CommandRule> {
    return this.http.post<CommandRule>(this.apiUrl, rule);
  }

  deleteRule(ruleId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${ruleId}`);
  }
}
