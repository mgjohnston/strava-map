import type { ReactNode } from 'react';
import { AppBar, Toolbar, Typography, Container, Box } from '@mui/material';
import MapIcon from '@mui/icons-material/Map';

interface AppShellProps {
  children: ReactNode;
  stravaSlot?: ReactNode;
}

export function AppShell({ children, stravaSlot }: AppShellProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" color="primary" elevation={1}>
        <Toolbar>
          <MapIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="h1">
            Strava Map
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {stravaSlot}
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} sx={{ py: 3, flexGrow: 1, maxWidth: 1600 }}>
        {children}
      </Container>
    </Box>
  );
}
