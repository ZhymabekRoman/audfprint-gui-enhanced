import React, { useState } from 'react';
import {
  Box, Button, FormControl, IconButton, InputLabel,
  MenuItem, Select, OutlinedInput, InputAdornment,
} from '@mui/material';
import { CgExport } from 'react-icons/cg';
import { HiOutlineSearch } from 'react-icons/hi';
import { ImSortAmountAsc, ImSortAmountDesc } from 'react-icons/all';
import MatchCard from './MatchCard';
import theme from '../../theme';

export default function ListMatches(props) {
  const { filename, matchData } = props || {};
  const { error, parsedMatches = [] } = matchData || {};
  const [search, setSearch] = useState('');
  const [orderBy, setOrderBy] = useState();
  const [desc, setDesc] = useState(false);
  const compare = (a, b) => {
    if (typeof a[orderBy] === 'number') {
      return (desc ? -1 : 1) * (a[orderBy] - b[orderBy]);
    }
    if (typeof a[orderBy] === 'string') {
      // Attempt to parse strings as numbers for comparison
      const numA = parseFloat(a[orderBy]);
      const numB = parseFloat(b[orderBy]);
      // Check if both parsed values are numbers and not NaN
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return (desc ? -1 : 1) * (numA - numB);
      }
      // Fallback to string comparison if not both are numbers
      const strA = a[orderBy].toUpperCase();
      const strB = b[orderBy].toUpperCase();
      if (strA < strB) {
        return desc ? 1 : -1;
      }
      if (strA > strB) {
        return desc ? -1 : 1;
      }
      return 0;
    }
    return 0;
  };
  const filter = (a) => JSON.stringify(Object.values(a)).toUpperCase().indexOf(search.toUpperCase()) !== -1;

  return (
    <Box>
      {
        filename
          ? (
            <Button
              sx={{ mb: 2 }}
              theme={theme}
              variant="contained"
              startIcon={<CgExport size={25} />}
              onKeyPress={() => window.ipc.send('export', { object: 'analyses', filename })}
              onClick={() => window.ipc.send('export', { object: 'analyses', filename })}
            >
              Export analysis
            </Button>
          )
          : null
      }
      <FormControl sx={{ mb: 2, ml: 2, minWidth: 200 }} size="small">
        <InputLabel id="order-by-label">Order by</InputLabel>
        <Select
          labelId="order-by-label"
          id="order-by"
          value={orderBy}
          label="Order by"
          onChange={({ target: { value } }) => setOrderBy(value)}
        >
          <MenuItem value="database">Database</MenuItem>
          {
            filename
              ? null
              : <MenuItem value="name">Analyzed audio filename</MenuItem>
          }
          <MenuItem value="matchFilename">Match filename</MenuItem>
          <MenuItem value="matchDuration">Match duration</MenuItem>
          <MenuItem value="matchStartInQuery">Match start in query</MenuItem>
          <MenuItem value="matchStartInFingerprint">Match start in fingerprint</MenuItem>
          <MenuItem value="rank">Rank</MenuItem>
          <MenuItem value="commonHashNumerator">Common hashes</MenuItem>
        </Select>
      </FormControl>
      <IconButton
        sx={{ mb: 2 }}
        aria-label="order-by-button"
        onKeyPress={() => setDesc(!desc)}
        onClick={() => setDesc(!desc)}
      >
        {desc ? <ImSortAmountDesc /> : <ImSortAmountAsc />}
      </IconButton>
      <FormControl
        sx={{
          mb: 2, ml: 2, minWidth: 200, float: 'right',
        }}
        size="small"
        variant="outlined"
      >
        <InputLabel htmlFor="search-field">Search</InputLabel>
        <OutlinedInput
          id="search-field"
          type="text"
          value={search}
          onChange={({ target: { value } }) => setSearch(value)}
          endAdornment={(
            <InputAdornment position="end">
              <IconButton
                aria-label="search"
                edge="end"
              >
                <HiOutlineSearch />
              </IconButton>
            </InputAdornment>
          )}
          label="Password"
        />
      </FormControl>
      <pre>{error || ''}</pre>
      {
        parsedMatches.filter(filter).sort(compare).map((match) => (
          <MatchCard
            key={match.name + match.database}
            name={match.name}
            database={match.database}
            match={match}
          />
        ))
      }
    </Box>
  );
}
