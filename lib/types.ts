export type Policy = {
  id: number;
  policy_no: string;
  payment_status: string;
  amount: number;
  policy_holder: string;
  plan: string;
  due_date: string;
  phone_num: string;
};

export type Settings = {
  id: number;
  frequency: "off" | "daily" | "twice_daily";
  days_ahead: number;
  only_pending: boolean;
  last_run_at: string | null;
};
