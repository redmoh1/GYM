import type {
  AppSettings,
  DashboardDTO,
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
      exportExcel: () => Promise<string | null>;
      exportPdf: () => Promise<string | null>;
      backupDatabase: () => Promise<string | null>;
      writeLog: (message: string) => Promise<boolean>;
      onShortcut: (handler: (action: string) => void) => () => void;
    };
  }
}

export {};