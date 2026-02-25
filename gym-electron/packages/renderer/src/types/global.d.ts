import type {
  AppSettings,
  CheckinDTO,
  DashboardDTO,
  EnrollCardResultDTO,
  K40ListenerStateDTO,
  MemberDTO,
  MemberPayload,
  MembersQuery,
  RenewalPayload,
} from '@gym/shared';

declare global {
  interface Window {
    api: {
      members: {
        list: (query?: MembersQuery) => Promise<MemberDTO[]>;
        get: (id: number) => Promise<MemberDTO | null>;
        create: (payload: MemberPayload) => Promise<MemberDTO>;
        update: (id: number, payload: MemberPayload) => Promise<MemberDTO>;
        delete: (id: number) => Promise<void>;
        renew: (payload: RenewalPayload) => Promise<MemberDTO>;
      };
      dashboard: { get: () => Promise<DashboardDTO> };
      settings: {
        get: () => Promise<AppSettings>;
        update: (payload: Partial<AppSettings>) => Promise<AppSettings>;
      };
      k40: {
        state: () => Promise<K40ListenerStateDTO>;
        recent: (limit?: number) => Promise<CheckinDTO[]>;
        enrollCard: (memberId: number, timeoutSeconds?: number) => Promise<EnrollCardResultDTO>;
        assignCard: (memberId: number, cardId: string, forceTransfer?: boolean) => Promise<EnrollCardResultDTO>;
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
