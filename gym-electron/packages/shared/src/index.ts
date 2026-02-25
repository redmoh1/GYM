export type SubscriptionStatus = 'Active' | 'ExpiringSoon' | 'Expired';

export interface MemberDTO {
  id: number;
  fullName: string;
  phone: string;
  startDate: string;
  durationMonths: number;
  endDate: string;
  notes: string;
  cardId: string;
  photoPath: string;
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
  cardId?: string;
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
  deviceIp: string;
  devicePort: number;
  deviceName: string;
  enableDeviceListener: boolean;
  strictMode: boolean;
  managerPinConfigured: boolean;
}

export interface PlanDTO {
  id: number;
  name: string;
  months: number;
  price: number;
}

export type CheckinResult = 'ALLOW' | 'DENY' | 'UNKNOWN';

export interface CheckinDTO {
  id: number;
  memberId: number | null;
  memberName: string;
  memberPhone: string;
  memberEndDate: string | null;
  daysLeft: number | null;
  photoPath: string;
  cardId: string;
  deviceName: string;
  checkedAt: string;
  result: CheckinResult;
  reason: string;
}

export interface K40ListenerStateDTO {
  connected: boolean;
  status: string;
  enabled: boolean;
  deviceIp: string;
  devicePort: number;
  deviceName: string;
  lastError: string | null;
}

export interface EnrollCardResultDTO {
  status: 'BOUND' | 'CONFLICT';
  cardId: string;
  memberId: number;
  currentOwnerMemberId: number | null;
  currentOwnerName: string | null;
}

export interface CapturedCardDTO {
  cardId: string;
  ownerMemberId: number | null;
  ownerName: string | null;
}