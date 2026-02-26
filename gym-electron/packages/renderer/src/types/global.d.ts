import type {
  AppSettings,
  CapturedCardDTO,
  CheckinDTO,
  CheckinResult,
  DashboardDTO,
  EnrollCardResultDTO,
  K40ListenerStateDTO,
  MemberDTO,
  MemberPayload,
  MembersQuery,
  RenewalPayload,
  SessionsTopUpPayload,
} from '@gym/shared';

declare global {
  interface Window {
    api: {
      members: {
        list: (query?: MembersQuery) => Promise<MemberDTO[]>;
        get: (id: number) => Promise<MemberDTO | null>;
        create: (payload: MemberPayload, managerPin?: string) => Promise<MemberDTO>;
        update: (id: number, payload: MemberPayload) => Promise<MemberDTO>;
        delete: (id: number, managerPin?: string) => Promise<void>;
        renew: (payload: RenewalPayload) => Promise<MemberDTO>;
        topUpSessions: (payload: SessionsTopUpPayload) => Promise<MemberDTO>;
      };
      dashboard: { get: () => Promise<DashboardDTO> };
      settings: {
        get: () => Promise<AppSettings>;
        update: (payload: Partial<AppSettings>) => Promise<AppSettings>;
      };
      security: {
        verifyPin: (pin: string) => Promise<boolean>;
        setPin: (pin: string) => Promise<boolean>;
      };
      k40: {
        state: () => Promise<K40ListenerStateDTO>;
        recent: (limit?: number) => Promise<CheckinDTO[]>;
        captureCard: (timeoutSeconds?: number) => Promise<CapturedCardDTO>;
        enrollCard: (memberId: number, timeoutSeconds?: number, managerPin?: string) => Promise<EnrollCardResultDTO>;
        assignCard: (memberId: number, cardId: string, forceTransfer?: boolean, managerPin?: string) => Promise<EnrollCardResultDTO>;
        recordManualCheckin: (memberId: number, cardId: string, result: CheckinResult, reason: string) => Promise<CheckinDTO>;
        onEvent: (handler: (event: CheckinDTO) => void) => () => void;
        onState: (handler: (state: K40ListenerStateDTO) => void) => () => void;
      };
      exportExcel: () => Promise<string | null>;
      exportPdf: () => Promise<string | null>;
      backupDatabase: () => Promise<string | null>;
      restoreDatabase: () => Promise<{ restored: boolean }>;
      writeLog: (message: string) => Promise<boolean>;
      onShortcut: (handler: (action: string) => void) => () => void;
    };
  }
}

export {};
