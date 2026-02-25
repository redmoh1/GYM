import { useEffect, useState } from 'react';

import type { MemberDTO } from '@gym/shared';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { api } from '../../lib/api';

interface Props {
  open: boolean;
  cardId: string;
  loading?: boolean;
  onCancel: () => void;
  onLink: (memberId: number) => Promise<void>;
}

export function LinkCardDialog({ open, cardId, loading = false, onCancel, onLink }: Props) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<MemberDTO[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = async (text: string) => {
    setSearching(true);
    try {
      const results = await api.members.list({ search: text.trim() });
      setRows(results.slice(0, 25));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedMemberId(null);
    void runSearch('');
  }, [open]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} fullWidth maxWidth="sm">
      <DialogTitle>ربط البطاقة بلاعب موجود</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            card_id: {cardId}
          </Typography>

          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو الهاتف"
              size="small"
            />
            <Button variant="outlined" onClick={() => void runSearch(search)} disabled={searching || loading}>
              بحث
            </Button>
          </Stack>

          <List dense sx={{ maxHeight: 280, overflow: 'auto', border: '1px solid #E2E8F0', borderRadius: 2 }}>
            {rows.map((member) => (
              <ListItemButton
                key={member.id}
                selected={selectedMemberId === member.id}
                onClick={() => setSelectedMemberId(member.id)}
              >
                <ListItemText
                  primary={member.fullName}
                  secondary={`الهاتف: ${member.phone || '-'} | ينتهي: ${member.endDate}`}
                />
              </ListItemButton>
            ))}
            {rows.length === 0 && (
              <Typography sx={{ p: 2 }} color="text.secondary">
                لا توجد نتائج.
              </Typography>
            )}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>إلغاء</Button>
        <Button
          variant="contained"
          disabled={loading || selectedMemberId === null}
          onClick={() => {
            if (selectedMemberId === null) return;
            void onLink(selectedMemberId);
          }}
        >
          ربط
        </Button>
      </DialogActions>
    </Dialog>
  );
}