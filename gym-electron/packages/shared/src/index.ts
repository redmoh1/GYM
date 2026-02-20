export type SubscriptionStatus = 'Active' | 'ExpiringSoon' | 'Expired';

export interface MemberDTO {
  id: number;
  fullName: string;
  phone: string;
  startDate: string;
  durationMonths: number;
  endDate: string;
  notes: string;
  planId: number | null;
  planName: string | null;
  status: SubscriptionStatus;
  daysLeft: number;
}

export interface CountersDTO {
  active: number;
  expiringSoon: number;
  expired: number;
  total: number;
}

export interface DashboardDTO {
  counters: CountersDTO;
  nearestExpiring: MemberDTO[];
}

export interface MembersQuery {
  search?: string;
  status?: SubscriptionStatus | 'All';
}

export interface MemberPayload {
  fullName: string;
  phone: string;
  startDate: string;
  durationMonths: number;
  notes?: string;
  planId?: number | null;
}

export interface RenewalPayload {
  memberId: number;
  months: number;
  amount?: number;
  note?: string;
}

export interface AppSettings {
  expiringSoonDays: number;
  currency: string;
  gymName: string;
}

export interface PlanDTO {
  id: number;
  name: string;
  months: number;
  price: number;
}