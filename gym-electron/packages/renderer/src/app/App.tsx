import { useEffect, useRef, useState } from 'react';

import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { SnackbarProvider, useSnackbar } from 'notistack';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

import { AppLayout } from '../components/AppLayout';
import { MemberDialog } from '../components/MemberDialog';
import { playCheckinTone } from '../lib/sound';
import { DashboardPage } from '../pages/DashboardPage';
import { ExpiredPage } from '../pages/ExpiredPage';
import { ExpiringSoonPage } from '../pages/ExpiringSoonPage';
import { GateKioskPage } from '../pages/GateKioskPage';
import { MemberProfilePage } from '../pages/MemberProfilePage';
import { MembersPage } from '../pages/MembersPage';
import { SettingsPage } from '../pages/SettingsPage';
import { useGymStore } from '../store/useGymStore';
import { theme } from '../styles/theme';

const cacheRtl = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] });

function shouldRequestPin(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /pin|strict mode|manager/i.test(message);
}

function AppShell() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { createMember, loadDashboard, dashboard } = useGymStore();
  const [search, setSearch] = useState('');
  const [openAdd, setOpenAdd] = useState(false);
  const startupAlertShownRef = useRef(false);
  const listenerErrorRef = useRef<string>('');

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!dashboard) return;
    if (startupAlertShownRef.current) return;
    startupAlertShownRef.current = true;

    if (dashboard.counters.expiringSoon > 0 || dashboard.counters.expired > 0) {
      enqueueSnackbar(`تنبيه: ${dashboard.counters.expiringSoon} قريب ينتهي / ${dashboard.counters.expired} منتهي`, {
        variant: 'warning',
      });
    }
  }, [dashboard, enqueueSnackbar]);

  useEffect(() => {
    const unsub = window.api.onShortcut((action) => {
      if (action === 'add-member') setOpenAdd(true);
      if (action === 'renew') enqueueSnackbar('استخدم زر تجديد داخل جداول اللاعبين', { variant: 'info' });
    });
    return unsub;
  }, [enqueueSnackbar]);

  useEffect(() => {
    const unsubscribeEvent = window.api.k40.onEvent((event) => {
      navigate('/gate');
      const variant = event.result === 'ALLOW' ? 'success' : event.result === 'DENY' ? 'error' : 'warning';
      enqueueSnackbar(`${event.result} - ${event.reason} - ${event.cardId}`, { variant });
      playCheckinTone(event.result);
    });

    const unsubscribeState = window.api.k40.onState((state) => {
      if (!state.lastError) return;
      if (listenerErrorRef.current === state.lastError) return;
      listenerErrorRef.current = state.lastError;
      enqueueSnackbar(state.lastError, { variant: 'error' });
    });

    return () => {
      unsubscribeEvent();
      unsubscribeState();
    };
  }, [enqueueSnackbar, navigate]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void window.api.writeLog(`RendererError: ${event.message}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void window.api.writeLog(`RendererRejection: ${String(event.reason)}`);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <AppLayout search={search} setSearch={setSearch} onAdd={() => setOpenAdd(true)}>
      <Routes>
        <Route path="/" element={<DashboardPage search={search} />} />
        <Route path="/members" element={<MembersPage search={search} />} />
        <Route path="/expiring" element={<ExpiringSoonPage search={search} />} />
        <Route path="/expired" element={<ExpiredPage search={search} />} />
        <Route path="/gate" element={<GateKioskPage />} />
        <Route path="/member/:id" element={<MemberProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>

      <MemberDialog
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSubmit={async (payload, managerPin) => {
          try {
            await createMember(payload, managerPin);
          } catch (error) {
            if (!shouldRequestPin(error)) throw error;
            const pin = window.prompt('تسجيل لاعب جديد يتطلب PIN المدير:', '');
            if (!pin) return;
            await createMember(payload, pin.trim());
          }
          enqueueSnackbar('تمت إضافة اللاعب', { variant: 'success' });
        }}
      />
    </AppLayout>
  );
}

export function App() {
  if (!window.api) {
    return <div style={{ padding: 24, fontFamily: 'Cairo, Segoe UI, sans-serif' }}>خطأ: لم يتم حقن window.api من preload.</div>;
  }

  return (
    <CacheProvider value={cacheRtl}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider maxSnack={4} anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}>
          <BrowserRouter>
            <Box dir="rtl">
              <AppShell />
            </Box>
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </CacheProvider>
  );
}