import { Alert } from '@mui/material';
import { AppShell } from './components/layout';
import { StravaConnect } from './components/strava';
import { MapView } from './components/MapView';
import { useStrava } from './hooks/useStrava';

function App() {
  const strava = useStrava();

  const stravaSlot = (
    <StravaConnect
      isConnected={strava.isConnected}
      isLoading={strava.isLoading}
      isSyncing={strava.isSyncing}
      athleteName={strava.athleteName}
      lastSyncTime={strava.lastSyncTime}
      onConnect={strava.connect}
      onDisconnect={strava.disconnect}
      onSync={async () => {
        /* sync is driven by MapView's date range — top-bar Sync menu re-runs
           the last successful range. If never synced, fall back to last 30d. */
        const today = new Date();
        const thirtyAgo = new Date(today);
        thirtyAgo.setDate(today.getDate() - 30);
        await strava.sync(thirtyAgo.toISOString().slice(0, 10), today.toISOString().slice(0, 10));
      }}
    />
  );

  return (
    <AppShell stravaSlot={stravaSlot}>
      {strava.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {strava.error}
        </Alert>
      )}
      <MapView
        isConnected={strava.isConnected}
        isSyncing={strava.isSyncing}
        activities={strava.activities}
        onSync={strava.sync}
      />
    </AppShell>
  );
}

export default App;
