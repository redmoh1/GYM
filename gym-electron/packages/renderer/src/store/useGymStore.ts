import { create } from 'zustand';

import type { AppSettings, DashboardDTO, MemberDTO, MemberPayload, MembersQuery, RenewalPayload } from '@gym/shared';

import { api } from '../lib/api';

interface GymState {
  members: MemberDTO[];
  dashboard: DashboardDTO | null;
  settings: AppSettings | null;
  loading: boolean;
  lastMembersQuery: MembersQuery;
  loadMembers: (query?: MembersQuery) => Promise<void>;
  loadDashboard: () => Promise<void>;
  loadSettings: () => Promise<void>;
  createMember: (payload: MemberPayload) => Promise<void>;
  updateMember: (id: number, payload: MemberPayload) => Promise<void>;
  deleteMember: (id: number) => Promise<void>;
  renewMember: (payload: RenewalPayload) => Promise<MemberDTO>;
  updateSettings: (payload: Partial<AppSettings>) => Promise<void>;
}

export const useGymStore = create<GymState>((set) => ({
  members: [],
  dashboard: null,
  settings: null,
  loading: false,
  lastMembersQuery: {},
  loadMembers: async (query = {}) => {
    set({ loading: true });
    const members = await api.members.list(query);
    set({ members, loading: false, lastMembersQuery: query });
  },
  loadDashboard: async () => {
    const dashboard = await api.dashboard.get();
    set({ dashboard });
  },
  loadSettings: async () => {
    const settings = await api.settings.get();
    set({ settings });
  },
  createMember: async (payload) => {
    await api.members.create(payload);
    const query = useGymStore.getState().lastMembersQuery;
    const members = await api.members.list(query);
    const dashboard = await api.dashboard.get();
    set({ members, dashboard });
  },
  updateMember: async (id, payload) => {
    await api.members.update(id, payload);
    const query = useGymStore.getState().lastMembersQuery;
    const members = await api.members.list(query);
    const dashboard = await api.dashboard.get();
    set({ members, dashboard });
  },
  deleteMember: async (id) => {
    await api.members.delete(id);
    const query = useGymStore.getState().lastMembersQuery;
    const members = await api.members.list(query);
    const dashboard = await api.dashboard.get();
    set({ members, dashboard });
  },
  renewMember: async (payload) => {
    const updated = await api.members.renew(payload);
    const query = useGymStore.getState().lastMembersQuery;
    const members = await api.members.list(query);
    const dashboard = await api.dashboard.get();
    set({ members, dashboard });
    return updated;
  },
  updateSettings: async (payload) => {
    const settings = await api.settings.update(payload);
    set({ settings });
  },
}));
