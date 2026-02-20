import { useEffect, useState } from 'react';

import BackupRounded from '@mui/icons-material/BackupRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import { Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';

import { api } from '../lib/api';
import { useGymStore } from '../store/useGymStore';

export function SettingsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { settings, loadSettings, updateSettings } = useGymStore();

  const [expiringDays, setExpiringDays] = useState(7);
  const [gymName, setGymName] = useState('');

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!settings) return;
    setExpiringDays(settings.expiringSoonDays);
    setGymName(settings.gymName);
  }, [settings]);

  return (
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800} mb={2}>الإعدادات</Typography>
      <Stack spacing={2} maxWidth={560}>
        <TextField
          type="number"
          label="عدد أيام قريب ينتهي"
          value={expiringDays}
          onChange={(e) => setExpiringDays(Number(e.target.value))}
        />
        <TextField
          label="اسم النادي"
          value={gymName}
          onChange={(e) => setGymName(e.target.value)}
        />

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            startIcon={<SaveRounded />}
            onClick={async () => {
              await updateSettings({ expiringSoonDays: expiringDays, gymName });
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