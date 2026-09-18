export type Policy = {
  id: number;
  policy_no: string;
  payment_status: string;
  transaction_id: string | null;
  amount: number | null;
  paid_at: string | null;
  policy_holder: string | null;
  plan: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  phone_num: string | null;
  email_id: string | null;
  whatsapp_num: string | null;
};

export type Settings = {
  id: number;
  frequency: "off" | "daily" | "twice_daily";
  days_ahead: number;
  only_pending: boolean;
  last_run_at: string | null;
};
