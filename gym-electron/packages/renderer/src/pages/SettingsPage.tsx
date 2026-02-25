import { useEffect, useMemo, useState } from 'react';

import BackupRounded from '@mui/icons-material/BackupRounded';
import LockResetRounded from '@mui/icons-material/LockResetRounded';
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
  const [strictMode, setStrictMode] = useState(false);
  const [managerPin, setManagerPin] = useState('');
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
    setStrictMode(settings.strictMode);
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

      <Stack spacing={2} maxWidth={700}>
        <TextField
          type="number"
          label="عدد أيام قريب ينتهي"
          value={expiringDays}
          onChange={(event) => setExpiringDays(Number(event.target.value))}
        />

        <TextField label="اسم النادي" value={gymName} onChange={(event) => setGymName(event.target.value)} />

        <Typography variant="subtitle1" fontWeight={800} sx={{ pt: 1 }}>
          Device Settings
        </Typography>

        <TextField label="device_ip" value={deviceIp} onChange={(event) => setDeviceIp(event.target.value)} />

        <TextField
          type="number"
          label="device_port"
          value={devicePort}
          onChange={(event) => setDevicePort(Number(event.target.value))}
        />

        <TextField label="device_name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />

        <FormControlLabel
          control={<Switch checked={enableListener} onChange={(event) => setEnableListener(event.target.checked)} />}
          label="enable_device_listener"
        />

        <Typography variant="subtitle1" fontWeight={800} sx={{ pt: 1 }}>
          Security
        </Typography>

        <FormControlLabel
          control={<Switch checked={strictMode} onChange={(event) => setStrictMode(event.target.checked)} />}
          label="strict_mode"
        />

        <TextField
          label="PIN المدير الجديد"
          type="password"
          value={managerPin}
          onChange={(event) => setManagerPin(event.target.value)}
          helperText="اتركه فارغًا إذا لا تريد تغييره الآن"
        />

        <Typography variant="body2" color="text.secondary">
          حالة PIN: {settings?.managerPinConfigured ? 'مضبوط' : 'غير مضبوط'}
        </Typography>

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
                strictMode,
              });

              if (managerPin.trim()) {
                await api.security.setPin(managerPin.trim());
                setManagerPin('');
                enqueueSnackbar('تم تحديث PIN المدير', { variant: 'success' });
              }

              await loadSettings();
              enqueueSnackbar('تم حفظ الإعدادات', { variant: 'success' });
            }}
          >
            حفظ
          </Button>

          <Button
            variant="outlined"
            startIcon={<LockResetRounded />}
            onClick={async () => {
              const pin = window.prompt('أدخل PIN الحالي للتحقق:', '');
              if (!pin) return;
              const valid = await api.security.verifyPin(pin);
              enqueueSnackbar(valid ? 'PIN صحيح' : 'PIN غير صحيح', { variant: valid ? 'success' : 'error' });
            }}
          >
            اختبار PIN
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