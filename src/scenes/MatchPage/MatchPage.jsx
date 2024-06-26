import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
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
import { Button } from '@mui/material';
import { IoMdAddCircle } from 'react-icons/io';
import { HiOutlineArrowCircleDown, HiOutlineArrowCircleUp, HiOutlineSearch } from 'react-icons/hi';
import { FaFileAudio } from 'react-icons/fa';
import ReactTooltip from 'react-tooltip';
import PythonOutput from '../FingerprintPage/PythonOutput';
import ListMatches from './ListMatches';
import mainTheme from '../../theme';
import InitialIcon from '../../InitialIcon';
import { DrawerHeader, AppBar, Drawer } from '../../drawer';

export default function AppContent() {
  const theme = mainTheme;
  const [open, setOpen] = useState(false);
  const [precomputeList, setPrecomputeList] = useState([]);
  const [selectedAnalysis, selectAnalysis] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
  const [matchData, setMatchData] = useState({ parsedMatchesByDatabase: [] });
  const { basename: selectedAnalysisName, fullname: selectedAnalysisFullname, mode } = selectedAnalysis || {};
  let title = 'New Analysis';
  if (selectedAnalysisName) {
    title = selectedAnalysisName;
  } else if (mode === 'search') {
    title = 'Search';
  }

  useEffect(() => {
    window.ipc.send('listPrecompute');
    window.ipc.on('precomputeListed', (event, data) => {
      const { files = [] } = data || {};
      setPrecomputeList(files);
    });
    window.ipc.on('matchesListed', (event, data) => {
      setMatchData(data || {}); // { error, parsedMatches = [] }
    });
    return () => {
      window.ipc.removeAllListeners('precomputeListed');
      window.ipc.removeAllListeners('matchesListed');
    };
  }, []);

  // clear selected analysis when the precompute list is updated
  useEffect(() => {
    selectAnalysis({});
  }, [precomputeList]);

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
          <Typography variant="h6" noWrap component="div">{title}</Typography>
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
            precomputeList.map(({ basename, fullname }) => (
              <ListItemButton
                key={fullname}
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                  backgroundColor: selectedItem === fullname ? '#f0f0f0' : 'transparent',
                }}
                onClick={() => {
                  window.ipc.send('listMatches', { filename: fullname });
                  selectAnalysis({ basename, fullname });
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
                  <InitialIcon text={basename} borderStyle="outset" />
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
            onClick={() => selectAnalysis(null)}
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
            precomputeList.length ? (
              <ListItemButton
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                }}
                onClick={() => window.ipc.send('export', { object: 'analyses' })}
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
          {
            precomputeList.length ? (
              <ListItemButton
                sx={{
                  minHeight: 48,
                  justifyContent: open ? 'initial' : 'center',
                  px: 2.5,
                }}
                onClick={() => {
                  window.ipc.send('search');
                  selectAnalysis({ mode: 'search' });
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: open ? 3 : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  <HiOutlineSearch
                    data-delay-show="500"
                    data-tip="Search"
                    size={25}
                  />
                  <ReactTooltip />
                </ListItemIcon>
                <ListItemText primary="Search" sx={{ opacity: open ? 1 : 0 }} />
              </ListItemButton>
            ) : null
          }
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <DrawerHeader />
        {
          selectedAnalysisName || mode === 'search'
            ? <ListMatches filename={selectedAnalysisFullname} matchData={matchData} />
            : (
              <Box>
                <Button
                  theme={theme}
                  variant="contained"
                  startIcon={<FaFileAudio size={25} />}
                  onKeyPress={() => window.ipc.send('openAudioFile')}
                  onClick={() => window.ipc.send('openAudioFile')}
                >
                  Select audio file
                </Button>
                <Button
                  theme={theme}
                  sx={{ ml: 1 }}
                  variant="contained"
                  startIcon={<HiOutlineArrowCircleDown size={25} />}
                  onKeyPress={() => window.ipc.send('import', { object: 'analyses' })}
                  onClick={() => window.ipc.send('import', { object: 'analyses' })}
                >
                  Import analyses
                </Button>
                <PythonOutput timestamp={new Date().valueOf()} />
              </Box>
            )
        }
      </Box>
    </Box>
  );
}
