import { useEffect, useMemo, useState } from 'react';

import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { Avatar, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useNavigate, useParams } from 'react-router-dom';

import type { CheckinDTO, MemberDTO } from '@gym/shared';

import { api } from '../lib/api';

function toFileUrl(pathValue: string): string | undefined {
  if (!pathValue) return undefined;
  return `file:///${pathValue.replace(/\\/g, '/')}`;
}

function statusArabic(status: MemberDTO['status']): string {
  if (status === 'Active') return 'ساري';
  if (status === 'ExpiringSoon') return 'قريب ينتهي';
  return 'منتهي';
}

function statusColor(status: MemberDTO['status']): 'success' | 'warning' | 'error' {
  if (status === 'Active') return 'success';
  if (status === 'ExpiringSoon') return 'warning';
  return 'error';
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ar-EG');
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ar-EG');
}

export function MemberProfilePage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { id } = useParams<{ id: string }>();
  const memberId = Number(id);

  const [member, setMember] = useState<MemberDTO | null>(null);
  const [checkins, setCheckins] = useState<CheckinDTO[]>([]);

  useEffect(() => {
    if (!Number.isFinite(memberId)) return;
    void (async () => {
      const profile = await api.members.get(memberId);
      setMember(profile);

      const rows = await api.k40.recent(100);
      setCheckins(rows.filter((row) => row.memberId === memberId).slice(0, 20));
    })();
  }, [memberId]);

  const avatarSrc = useMemo(() => (member?.photoPath ? toFileUrl(member.photoPath) : undefined), [member?.photoPath]);

  if (!Number.isFinite(memberId)) {
    return <Paper sx={{ p: 3, borderRadius: 3 }}>معرف اللاعب غير صحيح.</Paper>;
  }

  if (!member) {
    return <Paper sx={{ p: 3, borderRadius: 3 }}>تعذر العثور على ملف اللاعب.</Paper>;
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h5" fontWeight={900}>
            ملف اللاعب
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="error"
              onClick={async () => {
                if (!window.confirm(`حذف اللاعب: ${member.fullName}؟`)) return;
                const pin = window.prompt('أدخل PIN المدير للحذف:', '');
                if (!pin?.trim()) return;

                await api.members.delete(member.id, pin.trim());
                enqueueSnackbar('تم حذف اللاعب', { variant: 'success' });
                navigate('/members');
              }}
            >
              حذف
            </Button>
            <Button variant="outlined" startIcon={<ArrowBackRounded />} onClick={() => navigate(-1)}>
              رجوع
            </Button>
          </Stack>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Avatar src={avatarSrc} variant="rounded" sx={{ width: 140, height: 140, bgcolor: '#F1F5F9' }}>
            {member.fullName.slice(0, 1)}
          </Avatar>
          <Box>
            <Stack direction="row" spacing={1} mb={1}>
              <Typography variant="h6" fontWeight={800}>
                {member.fullName}
              </Typography>
              <Chip label={statusArabic(member.status)} color={statusColor(member.status)} />
            </Stack>
            <Typography>
              <strong>الهاتف:</strong> {member.phone}
            </Typography>
            <Typography>
              <strong>رقم البطاقة:</strong> {member.cardId || '-'}
            </Typography>
            <Typography>
              <strong>تاريخ البداية:</strong> {formatDate(member.startDate)}
            </Typography>
            <Typography>
              <strong>تاريخ النهاية:</strong> {formatDate(member.endDate)}
            </Typography>
            <Typography>
              <strong>الأيام المتبقية:</strong> {member.daysLeft}
            </Typography>
            <Typography>
              <strong>الملاحظات:</strong> {member.notes || '-'}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography fontWeight={800} mb={1.5}>
          آخر عمليات المرور (20)
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>الوقت</TableCell>
              <TableCell>البطاقة</TableCell>
              <TableCell>الحالة</TableCell>
              <TableCell>السبب</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {checkins.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDateTime(row.checkedAt)}</TableCell>
                <TableCell>{row.cardId}</TableCell>
                <TableCell>{row.result}</TableCell>
                <TableCell>{row.reason}</TableCell>
              </TableRow>
            ))}
            {checkins.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  لا توجد عمليات مرور مسجلة لهذا اللاعب.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
