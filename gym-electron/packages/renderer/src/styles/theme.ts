import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  direction: 'rtl',
  palette: {
    mode: 'light',
    primary: { main: '#2F6BFF' },
    success: { main: '#16A34A' },
    warning: { main: '#F59E0B' },
    error: { main: '#DC2626' },
    background: { default: '#F4F7FB', paper: '#FFFFFF' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Cairo, Tajawal, Segoe UI, sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 700 },
      },
    },
  },
});