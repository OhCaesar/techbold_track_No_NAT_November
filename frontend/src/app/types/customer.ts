export interface SystemInfo {
  ip: string;
  port: number;
  username: string;
  os: string;
  notes: string | null;
}

export interface Customer {
  id: number;
  company_name: string;
  firstname: string;
  lastname: string;
  system: SystemInfo;
}
