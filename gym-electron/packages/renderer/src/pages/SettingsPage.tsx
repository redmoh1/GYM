import { useEffect, useState } from 'react';

import BackupRounded from '@mui/icons-material/BackupRounded';
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
    if (settings) {
      setExpiringDays(settings.expiringSoonDays);
      setGymName(settings.gymName);
    }
  }, [settings]);

  return (
    <Paper sx={{ p: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800} mb={2}>الإعدادات</Typography>
      <Stack spacing={2} maxWidth={500}>
        <TextField type="number" label="عدد أيام قريب ينتهي" value={expiringDays} onChange={(e) => setExpiringDays(Number(e.target.value))} />
        <TextField label="اسم النادي" value={gymName} onChange={(e) => setGymName(e.target.value)} />

        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<SaveRounded />} onClick={async () => { await updateSettings({ expiringSoonDays: expiringDays, gymName }); enqueueSnackbar('تم حفظ الإعدادات', { variant: 'success' }); }}>
            حفظ
          </Button>
          <Button variant="outlined" startIcon={<BackupRounded />} onClick={async () => { await api.backupDatabase(); enqueueSnackbar('تم إنشاء نسخة احتياطية', { variant: 'success' }); }}>
            Backup
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}