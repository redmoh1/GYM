import { useEffect, useRef, useState } from 'react';

import type { MemberDTO, MemberPayload } from '@gym/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

interface Props {
  open: boolean;
  member?: MemberDTO | null;
  onClose: () => void;
  onSubmit: (payload: MemberPayload) => Promise<void>;
  onBindCard?: (memberId: number) => Promise<string>;
}

function defaultForm(): MemberPayload {
  return {
    fullName: '',
    phone: '',
    startDate: new Date().toISOString().slice(0, 10),
    durationMonths: 1,
    notes: '',
    planId: null,
  };
}

export function MemberDialog({ open, member, onClose, onSubmit, onBindCard }: Props) {
  const [form, setForm] = useState<MemberPayload>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [cardId, setCardId] = useState('');
  const [bindingOpen, setBindingOpen] = useState(false);
  const [bindingSecondsLeft, setBindingSecondsLeft] = useState(10);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorText(null);
    setBindingError(null);

    if (member) {
      setForm({
        fullName: member.fullName,
        phone: member.phone,
        startDate: member.startDate,
        durationMonths: member.durationMonths,
        notes: member.notes,
        planId: member.planId,
      });
      setCardId(member.cardId ?? '');
      return;
    }

    setForm(defaultForm());
    setCardId('');
  }, [open, member]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const save = async () => {
    if (saving) return;
    setErrorText(null);

    if (!form.fullName.trim()) {
      setErrorText('الرجاء إدخال الاسم الكامل');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        notes: form.notes?.trim() ?? '',
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل حفظ بيانات اللاعب';
      setErrorText(`خطأ: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const bindCard = async () => {
    if (!member || !onBindCard) return;

    setBindingError(null);
    setBindingSecondsLeft(10);
    setBindingOpen(true);

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setBindingSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    try {
      const linkedCard = await onBindCard(member.id);
      setCardId(linkedCard);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر ربط البطاقة';
      setBindingError(message);
    } finally {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setBindingOpen(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
        <DialogTitle>{member ? 'تعديل لاعب' : 'إضافة لاعب'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 2 }}>
          {errorText && <Alert severity="error">{errorText}</Alert>}
          {bindingError && <Alert severity="error">{bindingError}</Alert>}

          <TextField
            label="الاسم الكامل"
            value={form.fullName}
            onChange={(e) => {
              setErrorText(null);
              setForm({ ...form, fullName: e.target.value });
            }}
          />

          <TextField
            label="الهاتف"
            value={form.phone}
            onChange={(e) => {
              setErrorText(null);
              setForm({ ...form, phone: e.target.value });
            }}
          />

          <TextField
            type="date"
            label="تاريخ البداية"
            value={form.startDate}
            InputLabelProps={{ shrink: true }}
            onChange={(e) => {
              setErrorText(null);
              setForm({ ...form, startDate: e.target.value });
            }}
          />

          <TextField
            select
            label="المدة بالأشهر"
            value={form.durationMonths}
            onChange={(e) => {
              setErrorText(null);
              setForm({ ...form, durationMonths: Number(e.target.value) });
            }}
          >
            {[1, 2, 3, 6, 12].map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </TextField>

          <Stack spacing={0.75}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <TextField label="رقم البطاقة" value={cardId || '-'} InputProps={{ readOnly: true }} fullWidth />
              <Button variant="outlined" onClick={bindCard} disabled={!member || !onBindCard} sx={{ minWidth: 130 }}>
                ربط بطاقة
              </Button>
            </Stack>
            {!member && (
              <Typography variant="caption" color="text.secondary">
                احفظ اللاعب أولاً، ثم افتح التعديل لربط البطاقة.
              </Typography>
            )}
          </Stack>

          <TextField
            label="ملاحظات"
            value={form.notes}
            onChange={(e) => {
              setErrorText(null);
              setForm({ ...form, notes: e.target.value });
            }}
            multiline
            rows={3}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bindingOpen} onClose={undefined} fullWidth maxWidth="xs">
        <DialogTitle>ربط بطاقة</DialogTitle>
        <DialogContent>
          <Typography>مرّر البطاقة على الجهاز الآن خلال {bindingSecondsLeft} ثوانٍ.</Typography>
        </DialogContent>
      </Dialog>
    </>
  );
}