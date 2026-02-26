import { useEffect, useState } from 'react';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';

interface Props {
  open: boolean;
  memberName: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (sessionsToAdd: number) => Promise<void>;
}

export function TopUpSessionsDialog({ open, memberName, loading = false, onClose, onConfirm }: Props) {
  const [sessionsToAdd, setSessionsToAdd] = useState(10);

  useEffect(() => {
    if (!open) return;
    setSessionsToAdd(10);
  }, [open]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>إضافة حصص</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>اللاعب: {memberName}</Typography>
          <TextField
            type="number"
            label="عدد الحصص"
            value={sessionsToAdd}
            onChange={(event) => setSessionsToAdd(Math.max(1, Number(event.target.value || 1)))}
            inputProps={{ min: 1 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          إلغاء
        </Button>
        <Button variant="contained" onClick={() => onConfirm(sessionsToAdd)} disabled={loading}>
          تأكيد
        </Button>
      </DialogActions>
    </Dialog>
  );
}
