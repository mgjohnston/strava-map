import {
  Button,
  Box,
  Typography,
  CircularProgress,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import { useState } from 'react';

interface StravaConnectProps {
  isConnected: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  athleteName: string | null;
  lastSyncTime: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => Promise<void>;
}

export function StravaConnect({
  isConnected,
  isLoading,
  isSyncing,
  athleteName,
  lastSyncTime,
  onConnect,
  onDisconnect,
  onSync,
}: StravaConnectProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isConnected) {
      setAnchorEl(event.currentTarget);
    } else {
      onConnect();
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSync = () => {
    handleClose();
    onSync();
  };

  const handleDisconnect = () => {
    handleClose();
    onDisconnect();
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never synced';
    const date = new Date(lastSyncTime);
    return `Last sync: ${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (isLoading) {
    return (
      <Button color="inherit" disabled>
        <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
        Connecting...
      </Button>
    );
  }

  return (
    <>
      <Button
        color="inherit"
        variant="outlined"
        size="small"
        onClick={handleClick}
        startIcon={
          isSyncing ? (
            <CircularProgress size={16} color="inherit" />
          ) : isConnected ? (
            <CheckCircleIcon />
          ) : undefined
        }
        sx={{ borderColor: 'rgba(255,255,255,0.5)' }}
      >
        {isSyncing
          ? 'Syncing...'
          : isConnected
            ? athleteName || 'Connected'
            : 'Connect Strava'}
      </Button>

      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {formatLastSync()}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleSync} disabled={isSyncing}>
          <SyncIcon sx={{ mr: 1 }} />
          Sync Activities
        </MenuItem>
        <MenuItem onClick={handleDisconnect}>
          <LogoutIcon sx={{ mr: 1 }} />
          Disconnect
        </MenuItem>
      </Menu>
    </>
  );
}
