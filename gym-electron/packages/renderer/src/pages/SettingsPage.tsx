import { useEffect, useMemo, useState } from 'react';

import BackupRounded from '@mui/icons-material/BackupRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import {
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';

import type { K40ListenerStateDTO } from '@gym/shared';

import { api } from '../lib/api';
import { useGymStore } from '../store/useGymStore';

export function SettingsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { settings, loadSettings, updateSettings } = useGymStore();

  const [expiringDays, setExpiringDays] = useState(7);
  const [gymName, setGymName] = useState('');
  const [deviceIp, setDeviceIp] = useState('');
  const [devicePort, setDevicePort] = useState(4370);
  const [deviceName, setDeviceName] = useState('ZKTeco K40');
  const [enableListener, setEnableListener] = useState(true);
  const [listenerState, setListenerState] = useState<K40ListenerStateDTO | null>(null);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!settings) return;
    setExpiringDays(settings.expiringSoonDays);
    setGymName(settings.gymName);
    setDeviceIp(settings.deviceIp);
    setDevicePort(settings.devicePort);
    setDeviceName(settings.deviceName);
    setEnableListener(settings.enableDeviceListener);
  }, [settings]);

  useEffect(() => {
    void (async () => {
      const current = await api.k40.state();
      setListenerState(current);
    })();
    const unsub = window.api.k40.onState((state) => {
      setListenerState(state);
    });
    return unsub;
  }, []);

  const listenerText = useMemo(() => {
    if (!listenerState) return 'حالة الجهاز: غير متاحة';
    const base = listenerState.connected ? 'متصل' : 'غير متصل';
    const error = listenerState.lastError ? ` - ${listenerState.lastError}` : '';
    return `حالة الجهاز: ${base} (${listenerState.status})${error}`;
  }, [listenerState]);

  return (
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800} mb={2}>
        الإعدادات
      </Typography>

      <Stack spacing={2} maxWidth={640}>
        <TextField
          type="number"
          label="عدد أيام قريب ينتهي"
          value={expiringDays}
          onChange={(e) => setExpiringDays(Number(e.target.value))}
        />
        <TextField label="اسم النادي" value={gymName} onChange={(e) => setGymName(e.target.value)} />

        <Typography variant="subtitle1" fontWeight={800} sx={{ pt: 1 }}>
          Device Settings
        </Typography>

        <TextField label="device_ip" value={deviceIp} onChange={(e) => setDeviceIp(e.target.value)} />
        <TextField
          type="number"
          label="device_port"
          value={devicePort}
          onChange={(e) => setDevicePort(Number(e.target.value))}
        />
        <TextField label="device_name" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
        <FormControlLabel
          control={<Switch checked={enableListener} onChange={(e) => setEnableListener(e.target.checked)} />}
          label="enable_device_listener"
        />

        <Typography variant="body2" color="text.secondary">
          {listenerText}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            startIcon={<SaveRounded />}
            onClick={async () => {
              await updateSettings({
                expiringSoonDays: expiringDays,
                gymName,
                deviceIp,
                devicePort,
                deviceName,
                enableDeviceListener: enableListener,
              });
              enqueueSnackbar('تم حفظ الإعدادات', { variant: 'success' });
            }}
          >
            حفظ
          </Button>

          <Button
            variant="outlined"
            startIcon={<BackupRounded />}
            onClick={async () => {
              try {
                const filePath = await api.backupDatabase();
                if (!filePath) return;
                enqueueSnackbar('تم إنشاء النسخة الاحتياطية بنجاح', { variant: 'success' });
              } catch (error) {
                const msg = error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء النسخة الاحتياطية';
                enqueueSnackbar(msg, { variant: 'error' });
              }
            }}
          >
            تحميل نسخة احتياطية
          </Button>

          <Button
            variant="outlined"
            color="warning"
            startIcon={<RestoreRounded />}
            onClick={async () => {
              const confirmed = window.confirm('⚠ سيتم استبدال جميع البيانات الحالية. هل أنت متأكد؟');
              if (!confirmed) return;

              try {
                const result = await api.restoreDatabase();
                if (!result.restored) return;
                enqueueSnackbar('جارٍ استرجاع النسخة الاحتياطية وإعادة تشغيل التطبيق...', { variant: 'info' });
              } catch (error) {
                const msg = error instanceof Error ? error.message : 'فشل استرجاع النسخة الاحتياطية';
                enqueueSnackbar(`فشل الاسترجاع: ${msg}`, { variant: 'error' });
              }
            }}
          >
            استرجاع نسخة احتياطية
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
