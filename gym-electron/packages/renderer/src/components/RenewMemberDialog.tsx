import { useEffect, useState } from 'react';

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type { RenewalPayload } from '@gym/shared';

interface Props {
  open: boolean;
  memberName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (months: number, startMode: NonNullable<RenewalPayload['startMode']>) => Promise<void>;
}

export function RenewMemberDialog({ open, memberName, loading = false, onClose, onConfirm }: Props) {
  const [months, setMonths] = useState(1);
  const [startMode, setStartMode] = useState<NonNullable<RenewalPayload['startMode']>>('from_end_date');

  useEffect(() => {
    if (!open) return;
    setMonths(1);
    setStartMode('from_end_date');
  }, [open]);

  const handleConfirm = async () => {
    await onConfirm(months, startMode);
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
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              setMonths(Math.min(12, Math.max(1, value)));
            }}
            inputProps={{ min: 1, max: 12 }}
          />
          <RadioGroup value={startMode} onChange={(event) => setStartMode(event.target.value as NonNullable<RenewalPayload['startMode']>)}>
            <FormControlLabel value="from_end_date" control={<Radio />} label="يجدد من تاريخ انتهاء الاشتراك الحالي" />
            <FormControlLabel value="from_today" control={<Radio />} label="يجدد من تاريخ اليوم" />
          </RadioGroup>
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
