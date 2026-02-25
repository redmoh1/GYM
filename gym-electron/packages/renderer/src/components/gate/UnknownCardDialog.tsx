import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';

interface Props {
  open: boolean;
  cardId: string;
  onCreateMember: () => void;
  onLinkExisting: () => void;
  onCancel: () => void;
}

export function UnknownCardDialog({ open, cardId, onCreateMember, onLinkExisting, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>بطاقة غير مسجلة</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Typography>لم يتم العثور على لاعب مرتبط بهذه البطاقة.</Typography>
          <Typography variant="body2" color="text.secondary">
            card_id: {cardId}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button variant="contained" onClick={onCreateMember}>
          تسجيل لاعب جديد
        </Button>
        <Button variant="outlined" onClick={onLinkExisting}>
          ربط البطاقة بلاعب موجود
        </Button>
        <Button onClick={onCancel}>إلغاء</Button>
      </DialogActions>
    </Dialog>
  );
}