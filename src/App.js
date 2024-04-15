import React, { useEffect, useState } from 'react';
import {
  Typography, Box, Modal, Backdrop,
} from '@mui/material';
import AppContent from './AppContent';

const App = () => {
  const [installationStatus, setInstallationStatus] = useState({
    installing: false,
  });
  const { installing } = installationStatus || {};

  useEffect(() => {
    window.ipc.on('installationStatusChanged', (event, data) => {
      setInstallationStatus(data);
    });
  }, []);

  return (
    <>
      <AppContent />
      <Modal
        open={installing}
        closeAfterTransition
        BackdropComponent={Backdrop}
        BackdropProps={{
          timeout: 500,
        }}
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Box sx={{ outline: 'none' }}>
          <Typography variant="h3" component="h3" sx={{ m: 5 }}>
            Installation in progress...
          </Typography>
        </Box>
      </Modal>
    </>
  );
};

export default App;
