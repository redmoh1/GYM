import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { Box, Button, InputAdornment, TextField, Typography } from '@mui/material';

import { Sidebar } from './Sidebar';

interface Props {
  children: React.ReactNode;
  search: string;
  setSearch: (s: string) => void;
  onAdd: () => void;
}

export function AppLayout({ children, search, setSearch, onAdd }: Props) {
  return (
    <Box sx={{ height: '100vh', p: 2, bgcolor: 'background.default' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, gap: 2, height: '100%' }}>
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <Sidebar />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Box
            sx={{
              p: 1.5,
              bgcolor: 'white',
              borderRadius: 3,
              border: '1px solid #E2E8F0',
              display: 'flex',
              gap: 1,
              alignItems: 'center',
            }}
          >
            <Typography fontWeight={800} sx={{ minWidth: 190 }}>
              نظام إدارة اشتراكات الجيم
            </Typography>
            <TextField
              size="small"
              fullWidth
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الهاتف أو رقم البطاقة"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> }}
            />
            <Button variant="contained" startIcon={<AddRounded />} onClick={onAdd}>
              إضافة لاعب
            </Button>
          </Box>

          <Box sx={{ minHeight: 0, flex: 1 }}>{children}</Box>
        </Box>
      </Box>
    </Box>
  );
}

