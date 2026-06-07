export interface AuditLog {
  id: string;
  chat_id: string;
  ticket_id: string;
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  was_blocked: boolean;
  auto_executed: boolean;
  accepted: boolean;
  executed_at: string;
}

export interface AuditLogListResponse {
  audit_logs: AuditLog[];
  count: number;
}
