import DashboardRounded from '@mui/icons-material/DashboardRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

const items = [
  { path: '/', label: 'لوحة التحكم', icon: <DashboardRounded /> },
  { path: '/members', label: 'جميع اللاعبين', icon: <GroupsRounded /> },
  { path: '/expiring', label: 'قريب ينتهي', icon: <ScheduleRounded /> },
  { path: '/expired', label: 'المنتهين', icon: <EventBusyRounded /> },
  { path: '/gate', label: 'Gate / Kiosk', icon: <FactCheckRounded /> },
  { path: '/settings', label: 'الإعدادات', icon: <SettingsRounded /> },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Box sx={{ width: 260, p: 1.5, bgcolor: '#0B1220', borderRadius: 3, color: 'white', height: '100%' }}>
      <Typography variant="h6" sx={{ fontWeight: 800, px: 1.5, py: 1 }}>
        GYM MANAGER
      </Typography>
      <List>
        {items.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              onClick={() => navigate(item.path)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                bgcolor: active ? 'primary.main' : 'transparent',
                color: active ? 'white' : '#CBD5E1',
                '&:hover': { bgcolor: active ? 'primary.main' : '#172338' },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}

