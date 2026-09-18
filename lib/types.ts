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
  synced_at?: string | null;
};

export type Settings = {
  id: number;
  days_ahead: number;
  only_pending: boolean;
  auto_send: boolean;
  last_auto_check_at: string | null;
};
