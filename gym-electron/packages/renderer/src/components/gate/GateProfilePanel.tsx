import type { CheckinDTO, K40ListenerStateDTO, MemberDTO } from '@gym/shared';
import { Avatar, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';

interface Props {
  event: CheckinDTO | null;
  member: MemberDTO | null;
  listenerState: K40ListenerStateDTO | null;
  onRenew: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewProfile: () => void;
}

const ltrValueSx = { direction: 'ltr', unicodeBidi: 'plaintext', display: 'inline-block' } as const;

function toFileUrl(pathValue: string): string | undefined {
  if (!pathValue) return undefined;
  return `file:///${pathValue.replace(/\\/g, '/')}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function mapResultLabel(result: CheckinDTO['result'] | 'WAITING'): string {
  if (result === 'ALLOW') return 'مسموح';
  if (result === 'DENY') return 'مرفوض';
  if (result === 'UNKNOWN') return 'غير معروف';
  return 'بانتظار بطاقة';
}

function mapResultColor(result: CheckinDTO['result'] | 'WAITING'): 'success' | 'error' | 'warning' | 'default' {
  if (result === 'ALLOW') return 'success';
  if (result === 'DENY') return 'error';
  if (result === 'UNKNOWN') return 'warning';
  return 'default';
}

function subscriptionLabel(status: MemberDTO['status'] | null): string {
  if (!status) return '-';
  if (status === 'Active') return 'اشتراك ساري';
  if (status === 'ExpiringSoon') return 'قريب الانتهاء';
  return 'اشتراك منتهي';
}

export function GateProfilePanel({ event, member, listenerState, onRenew, onEdit, onDelete, onViewProfile }: Props) {
  const latestStatus = event?.result ?? 'WAITING';
  const latestEndDate = member?.endDate ?? event?.memberEndDate ?? null;
  const latestDaysLeft = member?.daysLeft ?? event?.daysLeft ?? null;
  const avatarSrc = member?.photoPath ? toFileUrl(member.photoPath) : undefined;
  const actionDisabled = !member;

  const listenerText = listenerState
    ? `${listenerState.connected ? 'متصل' : 'غير متصل'} - ${listenerState.status}`
    : 'غير متاح';

  const isExpired = member?.status === 'Expired';

  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
        <Avatar
          src={avatarSrc}
          variant="rounded"
          sx={{ width: 150, height: 150, bgcolor: '#F1F5F9', color: '#64748B', fontWeight: 800, fontSize: 18 }}
        >
          {member?.fullName ? member.fullName.slice(0, 1) : '?'}
        </Avatar>

        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={1.5} flexWrap="wrap" useFlexGap>
            <Typography variant="h5" fontWeight={900}>
              Gate / Reception
            </Typography>
            <Chip label={mapResultLabel(latestStatus)} color={mapResultColor(latestStatus)} sx={{ fontWeight: 800 }} />
            <Chip
              label={subscriptionLabel(member?.status ?? null)}
              color={isExpired ? 'error' : 'default'}
              variant={isExpired ? 'filled' : 'outlined'}
            />
          </Stack>

          <Stack spacing={0.75}>
            <Typography>
              <strong>الاسم:</strong> {member?.fullName || event?.memberName || 'غير معروف'}
            </Typography>
            <Typography>
              <strong>الهاتف:</strong>{' '}
              <Box component="span" sx={ltrValueSx}>
                {member?.phone || event?.memberPhone || '-'}
              </Box>
            </Typography>
            <Typography>
              <strong>رقم البطاقة:</strong>{' '}
              <Box component="span" sx={ltrValueSx}>
                {event?.cardId || member?.cardId || '-'}
              </Box>
            </Typography>
            <Typography>
              <strong>تاريخ الانتهاء:</strong>{' '}
              <Box component="span" sx={ltrValueSx}>
                {latestEndDate ? formatDateTime(latestEndDate) : '-'}
              </Box>
            </Typography>
            <Typography>
              <strong>الأيام المتبقية:</strong>{' '}
              <Box component="span" sx={ltrValueSx}>
                {latestDaysLeft ?? '-'}
              </Box>
            </Typography>
            <Typography>
              <strong>السبب:</strong> {event?.reason || 'بانتظار تمرير بطاقة...'}
            </Typography>
            <Typography color="text.secondary">
              <strong>آخر عملية:</strong>{' '}
              <Box component="span" sx={ltrValueSx}>
                {event ? formatDateTime(event.checkedAt) : 'بانتظار تمرير بطاقة...'}
              </Box>
            </Typography>
            <Typography color="text.secondary">
              <strong>حالة الجهاز:</strong> {listenerText}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} mt={2} flexWrap="wrap" useFlexGap>
            <Button
              variant={isExpired ? 'contained' : 'outlined'}
              color={isExpired ? 'error' : 'primary'}
              onClick={onRenew}
              disabled={actionDisabled}
            >
              {isExpired ? 'تجديد الآن' : 'تجديد'}
            </Button>
            <Button variant="outlined" onClick={onEdit} disabled={actionDisabled}>
              تعديل
            </Button>
            <Button variant="outlined" color="error" onClick={onDelete} disabled={actionDisabled}>
              حذف
            </Button>
            <Button variant="outlined" color="secondary" onClick={onViewProfile} disabled={actionDisabled}>
              عرض الملف
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}
