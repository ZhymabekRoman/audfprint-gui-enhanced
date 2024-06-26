import React, { useEffect, useState } from 'react';
import { Box, Button } from '@mui/material';
import Toolbar from '@mui/material/Toolbar';
import List from '@mui/material/List';
import CssBaseline from '@mui/material/CssBaseline';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { IoMdAddCircle } from 'react-icons/io';
import { HiOutlineArrowCircleUp, HiOutlineArrowCircleDown } from 'react-icons/hi';
import { FaFileAudio } from 'react-icons/fa';
import ReactTooltip from 'react-tooltip';
import mainTheme from '../../theme';
import { DrawerHeader, AppBar, Drawer } from '../../drawer';
import InitialIcon from '../../InitialIcon';
import ReviewAudioFiles from './ReviewAudioFiles';
import ListDatabase from './ListDatabase';
import PythonOutput from './PythonOutput';

export default function FingerprintPage() {
  const theme = mainTheme;
  const [open, setOpen] = useState(() => JSON.parse(localStorage.getItem('drawerOpen')) || false);
  const [databaseList, setDatabaseList] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedDatabase, selectDatabase] = useState({});
  const { fullname: selectedDbFullname, basename: selectedDbName } = selectedDatabase || {};

  useEffect(() => {
    window.ipc.send('listDatabases');
    window.ipc.on('databasesListed', (event, data) => {
      const { files = [] } = data || {};
      setDatabaseList(files.sort((a, b) => a.basename.toLowerCase().localeCompare(b.basename.toLowerCase())));
    });
    return () => window.ipc.removeAllListeners('databasesListed');
  }, []);

  useEffect(() => {
    localStorage.setItem('drawerOpen', open);
  }, [open]);

  // clear selected database when the database list is updated
  useEffect(() => {
    selectDatabase({});
  }, [databaseList]);

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" open={open} theme={theme}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={() => setOpen(true)}
            edge="start"
            sx={{
              marginRight: 5,
              ...(open && { display: 'none' }),
            }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            {selectedDbName || 'New Fingerprint Database'}
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" open={open}>
        <DrawerHeader>
          <IconButton onClick={() => setOpen(false)}>
            {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </DrawerHeader>
        <Divider />
        <List>
          {
            databaseList.map(({ basename, fullname }) => (
              <ListItemButton
                key={fullname}
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                  backgroundColor: selectedItem === fullname ? '#f0f0f0' : 'transparent', // Modify this line
                }}
                onClick={() => {
                  window.ipc.send('listDatabase', { filename: fullname });
                  selectDatabase({ basename, fullname });
                  setSelectedItem(fullname);
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: open ? 3 : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  <InitialIcon text={basename} borderStyle="inset" />
                </ListItemIcon>
                <ListItemText primary={basename} sx={{ opacity: open ? 1 : 0 }} />
              </ListItemButton>
            ))
          }
          <ListItemButton
            sx={{
              minHeight: 48,
              justifyContent: open ? 'initial' : 'center',
              px: 2.5,
            }}
            onClick={() => selectDatabase(null)}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: open ? 3 : 'auto',
                justifyContent: 'center',
              }}
            >
              <IoMdAddCircle
                data-delay-show="500"
                data-tip="New"
                size={25}
              />
              <ReactTooltip />
            </ListItemIcon>
            <ListItemText primary="New" sx={{ opacity: open ? 1 : 0 }} />
          </ListItemButton>
          {
            databaseList.length ? (
              <ListItemButton
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                }}
                onClick={() => window.ipc.send('export', { object: 'databases' })}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: open ? 3 : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  <HiOutlineArrowCircleUp
                    data-delay-show="500"
                    data-tip="Export all"
                    size={25}
                  />
                  <ReactTooltip />
                </ListItemIcon>
                <ListItemText primary="Export all" sx={{ opacity: open ? 1 : 0 }} />
              </ListItemButton>
            ) : null
          }
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <DrawerHeader />
        {
          selectedDbFullname
            ? (
              <ListDatabase
                databaseList={databaseList}
                filename={selectedDbFullname}
                timestamp={new Date().valueOf()}
              />
            )
            : (
              <Box>
                <Button
                  theme={theme}
                  variant="contained"
                  startIcon={<FaFileAudio size={25} />}
                  onKeyPress={() => window.ipc.send('openAudioDirectory')}
                  onClick={() => window.ipc.send('openAudioDirectory')}
                >
                  Select directory with audio files
                </Button>
                <Button
                  theme={theme}
                  sx={{ ml: 1 }}
                  variant="contained"
                  startIcon={<HiOutlineArrowCircleDown size={25} />}
                  onKeyPress={() => window.ipc.send('import', { object: 'databases' })}
                  onClick={() => window.ipc.send('import', { object: 'databases' })}
                >
                  Import fingerprint databases
                </Button>
                <ReviewAudioFiles databaseList={databaseList} />
                <PythonOutput />
              </Box>
            )
        }
      </Box>
    </Box>
  );
}
