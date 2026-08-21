export interface StockRecord {
  id: string;
  date: string;
  kilos: number;
  created_at: any;
}

export interface SavedReport {
  id: string;
  month: string;
  period: 'first' | 'second';
  total_kilos: number;
  avg_kilos: number;
  data_json: string;
  created_at: any;
}

export interface PalletRecord {
  id: string;
  date: string;
  positions: number;
  created_at: any;
}

export interface PalletReport {
  id: string;
  week_start: string;
  week_end: string;
  total_positions: number;
  avg_positions: number;
  data_json: string;
  created_at: any;
}

export interface CepasRecord {
  id: string;
  date: string;
  positions: number;
  created_at: any;
}

export interface CepasReport {
  id: string;
  month: string;
  total_positions: number;
  avg_positions: number;
  data_json: string;
  created_at: any;
}

export interface EscorihuelaRecord {
  id: string;
  date: string;
  positions: number;
  created_at: any;
}

export interface EscorihuelaReport {
  id: string;
  month: string;
  total_positions: number;
  avg_positions: number;
  data_json: string;
  created_at: any;
}

export interface LaRuralRecord {
  id: string;
  date: string;
  positions: number;
  created_at: any;
}

export interface LaRuralReport {
  id: string;
  month: string;
  total_positions: number;
  avg_positions: number;
  data_json: string;
  created_at: any;
}

export interface AbastecimientoRecord {
  id: string;
  date: string;
  client: string;
  remito: string;
  pallets: number;
  pallets_arlog?: number;
  pallets_descartables?: number;
  pallets_rotos?: number;
  type?: 'ingreso' | 'egreso';
  created_at: any;
}

export type AgentFileType = 
  | 'abastecimientos' 
  | 'kilos' 
  | 'bianchi' 
  | 'cepas' 
  | 'escorihuela' 
  | 'la_rural' 
  | 'consolidado' 
  | 'backup';

export type AgentFrequency = 
  | 'daily' 
  | 'weekdays' 
  | 'weekly' 
  | 'fortnightly' 
  | 'monthly' 
  | 'monthly_last_day'
  | 'custom_days';

export type AgentDatePreset = 
  | 'all' 
  | 'today' 
  | 'last_7_days' 
  | 'current_fortnight' 
  | 'current_month';

export interface AgentSchedule {
  id: string;
  name: string;
  file_type: AgentFileType;
  file_format: 'xlsx' | 'json';
  date_range_preset: AgentDatePreset;
  frequency: AgentFrequency;
  days_of_week?: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  day_of_month?: number | 'last_day'; // 1-31 or 'last_day'
  monthly_mode?: 'last_day' | 'specific_day';
  time: string; // "08:00", "18:30"
  recipients: string[]; // Email addresses
  email_subject?: string;
  email_body?: string;
  auto_download: boolean;
  status: 'active' | 'paused';
  is_active?: boolean;
  last_run_at?: string | null;
  last_run_date?: string | null;
  last_run_status?: string | null;
  total_runs?: number;
  created_at?: any;
}

export interface AgentLog {
  id: string;
  agent_id: string;
  agent_name: string;
  file_type: AgentFileType;
  file_name: string;
  recipients: string[];
  executed_at: string;
  trigger_type: 'scheduled' | 'manual';
  status: 'success' | 'failed';
  details?: string;
  created_at?: any;
}
