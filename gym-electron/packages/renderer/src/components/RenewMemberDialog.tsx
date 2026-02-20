import { useState } from 'react';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';

interface Props {
  open: boolean;
  memberName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (months: number) => Promise<void>;
}

export function RenewMemberDialog({ open, memberName, loading = false, onClose, onConfirm }: Props) {
  const [months, setMonths] = useState(1);

  const handleConfirm = async () => {
    await onConfirm(months);
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>تجديد الاشتراك</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>اللاعب: {memberName}</Typography>
          <TextField
            type="number"
            label="عدد الأشهر"
            value={months}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isFinite(value)) return;
              setMonths(Math.min(12, Math.max(1, value)));
            }}
            inputProps={{ min: 1, max: 12 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          إلغاء
        </Button>
        <Button variant="contained" onClick={handleConfirm} disabled={loading}>
          تأكيد
        </Button>
      </DialogActions>
    </Dialog>
  );
}
