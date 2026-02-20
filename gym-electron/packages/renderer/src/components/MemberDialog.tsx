import { useEffect, useState } from 'react';

import type { MemberDTO, MemberPayload } from '@gym/shared';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';

interface Props {
  open: boolean;
  member?: MemberDTO | null;
  onClose: () => void;
  onSubmit: (payload: MemberPayload) => Promise<void>;
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

export function MemberDialog({ open, member, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<MemberPayload>(defaultForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (member) {
      setForm({
        fullName: member.fullName,
        phone: member.phone,
        startDate: member.startDate,
        durationMonths: member.durationMonths,
        notes: member.notes,
        planId: member.planId,
      });
      return;
    }

    setForm(defaultForm());
  }, [open, member]);

  const save = async () => {
    if (saving) return;

    if (!form.fullName.trim()) {
      window.alert('الرجاء إدخال الاسم الكامل');
      return;
    }

    if (!form.phone.trim()) {
      window.alert('الرجاء إدخال رقم الهاتف');
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
      window.alert(`خطأ: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{member ? 'تعديل لاعب' : 'إضافة لاعب'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: 2 }}>
        <TextField
          label="الاسم الكامل"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <TextField
          label="الهاتف"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <TextField
          type="date"
          label="تاريخ البداية"
          value={form.startDate}
          InputLabelProps={{ shrink: true }}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
        />
        <TextField
          select
          label="المدة بالأشهر"
          value={form.durationMonths}
          onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })}
        >
          {[1, 2, 3, 6, 12].map((m) => (
            <MenuItem key={m} value={m}>
              {m}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="ملاحظات"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
  );
}