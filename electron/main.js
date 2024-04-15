// Modules to control application life and create native browser window
require('dotenv').config();
const { app, ipcMain, Menu, dialog, shell } = require('electron');
// const { autoUpdater } = require('electron-updater');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { join, basename } = require('path');
const {
  promises: { readFile, writeFile, rm, rename, mkdir },
  existsSync,
  createWriteStream,
} = require('fs');
const {
  https: { get },
} = require('follow-redirects');
const log = require('electron-log');
const os = require('os');
const glob = require('glob');
const find = require('findit');
const cp = require('cp');
const openAboutWindow = require('about-window').default;
const anyAscii = require('any-ascii');
const {
  createAppWindow,
  isMainWindowDefined,
  sendToMainWindow,
} = require('./main/app-process');

const appPath = app.getAppPath();
const appVersion = app.getVersion();

let audfprintVersion = null;
let ffmpegVersion = null;

const getAboutWindowOptions = () => {
  const packageJsonDir = join(__dirname, '..');
  const prodIconPath = join(packageJsonDir, 'icon.png');
  const devIconPath = join(packageJsonDir, 'build/icon.png');
  const descriptionLines = [
    `Version: ${appVersion}`,
    `audfprint version: ${audfprintVersion}``FFmpeg version: ${ffmpegVersion}`,
  ];
  const aboutWindowOptions = {
    description: descriptionLines.join('\n'),
    icon_path: '',
  };
  if (existsSync(devIconPath)) {
    aboutWindowOptions.icon_path = devIconPath;
    aboutWindowOptions.package_json_dir = packageJsonDir;
  } else {
    aboutWindowOptions.icon_path = prodIconPath;
  }
  return aboutWindowOptions;
};

const getAppPath = (base, folder) => {
  const unpackedPath = `${base}.unpacked`;
  if (existsSync(unpackedPath)) {
    return join(unpackedPath, folder);
  }
  return join(base, folder);
};

const getPathVar = () => {
  const existingPath = process.env.PATH;
  return `${getAppPath(appPath, 'build/audfprint')}:${existingPath}`;
};

const getPrecomputePath = () => getAppPath(appPath, 'precompute');

const getDatabasePath = () => getAppPath(app.getPath('userData'), 'databases');

const getAsciiPath = () => getAppPath(app.getPath('userData'), 'ascii');

const listFiles = (root, ext) =>
  new Promise((resolve) => {
    const results = [];
    const finder = find(root);
    finder.on('file', (file) => {
      if (file.indexOf(ext) !== -1) {
        results.push({ basename: basename(file, ext), fullname: file });
      }
    });
    finder.on('error', () => {
      resolve(results);
    });
    finder.on('end', () => {
      resolve(results);
    });
  });

const copySync = (src, dest) => {
  sendToMainWindow('pythonOutput', { line: `Copying ${src}...` });
  cp.sync(src, dest);
};

const getFFmpegVersion = async () => {
  try {
    const { stdout } = await exec('ffmpeg -version', {
      env: { PATH: getPathVar() },
    });
    const versionMatch = stdout.match(/ffmpeg version (\S+)/);
    if (versionMatch) {
      return versionMatch[1];
    } else {
      throw new Error('Unable to parse FFmpeg version.');
    }
  } catch (error) {
    dialog.showErrorBox(
      'FFmpeg not found',
      `FFmpeg is required but was not found in your PATH. The application will now close. Please install FFmpeg and try again. Error: ${error}`
    );
    app.quit();
  }
};

const getAudfprintVersion = async () => {
  try {
    const { stdout, stderr, code } = await exec('audfprint --version', {
      env: { PATH: getPathVar() },
    });
    // const versionMatch = stdout.match(/audfprint-enhanced, version (\S+)/);
    const versionMatch = "OKay, it's installed"
    if (versionMatch) {
      return versionMatch[1];
    } else {
      if (code !== 0) {
        throw new Error(`Audfprint command failed with exit code ${code} and error: ${stderr}`);
      }
      versionMatch = "Unknown"
    }
  } catch (error) {
    dialog.showErrorBox(
      'Audfprint not found',
      `Audfprint is required but was not found in your PATH. The application will now close. Please install Audfprint and try again. Error: ${error}`
    );
    app.quit();
  }
};

const checkDependencies = async (counter = 0) => {
  sendToMainWindow('installationStatusChanged', { installing: true });

  ffmpegVersion = await getFFmpegVersion();
  audfprintVersion = await getAudfprintVersion();

  sendToMainWindow('installationStatusChanged', { installing: false });
};


const processMatchLine = async (line, dbName, precomputePaths) => {
  const precomputePath = precomputePaths.find(
    (path) => line.indexOf(path) !== -1
  );
  if (!precomputePath) {
    return;
  }
  const jsonPath = precomputePath.replace(/\.afpt$/, '.json');
  try {
    const contents = await readFile(jsonPath, 'utf-8');
    const analysis = JSON.parse(contents.toString());
    const { parsedMatchesByDatabase = {}, matchesByDatabase = {} } =
      analysis || {};
    if (!matchesByDatabase[dbName]) {
      matchesByDatabase[dbName] = [];
    }
    matchesByDatabase[dbName].push(line);
    const [
      isMatch,
      matchDuration,
      matchStartInQuery,
      matchStartInFingerprint,
      matchFilename,
      commonHashNumerator,
      commonHashDenominator,
      rank,
    ] =
      line.match(
        /^Matched (.+) s starting at (.+) s in .+ to time (.+) s in (.+) with (.+) of (.+) common hashes at rank (.+)$/
      ) || [];
    if (isMatch) {
      parsedMatchesByDatabase[dbName] = {
        matchDuration: matchDuration.trim(),
        matchStartInQuery: matchStartInQuery.trim(),
        matchStartInFingerprint: matchStartInFingerprint.trim(),
        matchFilename: matchFilename.trim(),
        commonHashNumerator: commonHashNumerator.trim(),
        commonHashDenominator: commonHashDenominator.trim(),
        rank: rank.trim(),
      };
    }
    await writeFile(
      jsonPath,
      JSON.stringify({
        ...analysis,
        matchesByDatabase,
        parsedMatchesByDatabase,
      })
    );
  } catch (e) {
    // ignore errors
  }
};

const match = async (dbName, dbFilename, precomputePaths) => {
  const matchCode = getAudfprintScript([
    'match',
    '-N',
    2,
    '-d',
    dbFilename,
    ...precomputePaths,
    '-R',
  ]);
  const matchLines = await sendPythonOutput('Matching...', matchCode);
  matchLines.reduce(
    (p, line) => p.then(() => processMatchLine(line, dbName, precomputePaths)),
    Promise.resolve()
  );
};

const processNewDatabase = async (filename, precomputePaths) => {
  const listCode = getAudfprintScript(['list', '-d', filename]);
  const metadataFilename = filename.replace('.pklz', '.txt');

  PythonShell.runString(listCode, { pythonPath }, (error, output) => {
    const file = createWriteStream(metadataFilename);
    if (error) {
      file.write(error.toString());
    } else {
      const [, header, ...lines] = output || [];
      file.write(`${header.replace(filename, basename(filename))}\n`);
      lines.sort().forEach((line) => {
        file.write(`${line}\n`);
      });
    }
    file.end();
  });

  const dbName = basename(filename, '.pklz');
  await match(dbName, filename, precomputePaths);
};

const analyzeWinAscii = async (filename, baseFilenameAscii) => {
  const asciiDir = getAsciiPath();
  const asciiFilename = join(asciiDir, baseFilenameAscii);
  if (!existsSync(asciiDir)) {
    await mkdir(asciiDir);
  }
  copySync(filename, asciiFilename);
  const code = getAudfprintScript(['precompute', '-i', 4, asciiFilename]);
  return sendPythonOutput('Analyzing...', code);
};

const analyzeWin = async (filename) => {
  const baseFilename = basename(filename);
  const baseFilenameAscii = anyAscii(baseFilename).replace(/[<>:"|?*/\\]/g, '');
  if (baseFilename !== baseFilenameAscii) {
    return analyzeWinAscii(filename, baseFilenameAscii);
  }
  const code = getAudfprintScript([
    'precompute',
    '-i',
    4,
    filename.replace(/\//g, '\\'),
  ]);
  return sendPythonOutput('Analyzing...', code);
};

const analyze = async (filename) => {
  if (process.platform === 'win32') {
    return analyzeWin(filename);
  }
  const code = getAudfprintScript(['precompute', '-i', 4, filename]);
  return sendPythonOutput('Analyzing...', code);
};

const processNewAnalysis = async (filename) => {
  const lines = await analyze(filename);
  let originalPrecomputePath = '';
  lines.forEach((line) => {
    if (!originalPrecomputePath) {
      [, originalPrecomputePath] = line.match(/^wrote (.+\.afpt)/) || [];
    }
  });
  const precomputeDir = getPrecomputePath();
  if (!originalPrecomputePath) {
    return;
  }
  const precomputePath = join(precomputeDir, basename(originalPrecomputePath));
  if (!existsSync(precomputeDir)) {
    await mkdir(precomputeDir);
  }
  await rename(originalPrecomputePath, precomputePath);

  const jsonPath = precomputePath.replace(/\.afpt$/, '.json');
  await writeFile(jsonPath, JSON.stringify({ precompute: lines }));

  return precomputePath;
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  const template = [
    {
      label: 'File',
      role: 'filemenu',
    },
    {
      label: 'Edit',
      role: 'editmenu',
    },
    {
      label: 'View',
      role: 'viewmenu',
    },
    {
      label: 'Window',
      role: 'windowmenu',
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        {
          label: 'About',
          click: () => openAboutWindow(getAboutWindowOptions()),
        },
        {
          label: 'Quit',
          role: 'quit',
        },
      ],
    },
  ];
  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Audio Fingerprinter',
      role: 'appmenu',
    });
  }
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  createAppWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!isMainWindowDefined()) {
    createAppWindow();
  }
});

// Start logging
log.transports.file.level = 'debug';
// autoUpdater.logger = log;

log.hooks.push((message, transport) => {
  if (transport !== log.transports.file) {
    return message;
  }
  sendToMainWindow('log', message);
  return message;
});
ipcMain.on('logStored', (event, storedLog) => {
  sendToMainWindow('logStored', storedLog);
});

// After the user logs in to the app and has the token, use it to check for updates
// ipcMain.on('checkForUpdates', () => {
//   autoUpdater.setFeedURL({
//     owner: 'mitin001',
//     provider: 'github',
//     repo: 'audfprint-gui',
//   });
//   autoUpdater.checkForUpdates();
// });

ipcMain.on('openAudioDirectory', () => {
  dialog
    .showOpenDialog({
      properties: ['openDirectory'],
    })
    .then(({ filePaths }) => {
      if (!filePaths || filePaths.length === 0) {
        return;
      }
      const [root] = filePaths;
      glob(`${root}/**/*`, (error, filenames) => {
        const winFilenames = filenames.map((filename) =>
          filename.replace(/\//g, '\\')
        );
        sendToMainWindow('audioDirectoryOpened', {
          root,
          dbName: basename(root),
          filenames: process.platform === 'win32' ? winFilenames : filenames,
          maxCores: os.cpus().length,
          platform: process.platform,
        });
      });
    });
});

ipcMain.on('listPrecompute', () => {
  listFiles(getPrecomputePath(), '.afpt').then((files) => {
    sendToMainWindow('precomputeListed', { files });
  });
});

ipcMain.on('listDatabases', () => {
  listFiles(getDatabasePath(), '.pklz').then((files) => {
    sendToMainWindow('databasesListed', { files });
  });
});

ipcMain.on('listDatabase', async (event, { filename }) => {
  try {
    const contents = await readFile(
      filename.replace(/\.pklz$/, '.txt'),
      'utf-8'
    );
    sendToMainWindow('pythonOutput', { line: contents });
  } catch (listError) {
    sendToMainWindow('pythonOutput', { error: listError.toString() });
  }
});

ipcMain.on('listMatches', async (event, { filename }) => {
  let contents;
  const name = basename(filename, '.afpt');
  try {
    contents = await readFile(filename.replace(/\.afpt$/, '.json'), 'utf-8');
  } catch (listError) {
    sendToMainWindow('matchesListed', { error: listError.toString() });
  }
  try {
    const parsedMatches = [];
    const analysis = JSON.parse(contents.toString());
    const { parsedMatchesByDatabase } = analysis || {};
    Object.keys(parsedMatchesByDatabase).forEach((database) => {
      parsedMatches.push({
        ...parsedMatchesByDatabase[database],
        database,
        name,
      });
    });
    sendToMainWindow('matchesListed', { parsedMatches });
  } catch (parseError) {
    sendToMainWindow('matchesListed', { error: parseError.toString() });
  }
});

ipcMain.on('import', async (event, { object }) => {
  const manifests = {
    databases: {
      title: 'Select a directory with .pklz files',
      emptyMessage: 'No .pklz files found in the selected directory',
      path: getDatabasePath(),
      dataExt: '.pklz',
      callback: async (files) => {
        const precomputeFiles = await listFiles(getPrecomputePath(), '.afpt');
        const precomputePaths = precomputeFiles.map(
          ({ fullname: precomputePath }) => precomputePath
        );
        files.reduce(
          (p, { fullname: filename }) =>
            p.then(() => processNewDatabase(filename, precomputePaths)),
          Promise.resolve()
        );
        listFiles(getDatabasePath(), '.pklz').then((mergedFiles) => {
          sendToMainWindow('databasesListed', { files: mergedFiles });
        });
      },
    },
    analyses: {
      title: 'Select a directory with .afpt files',
      emptyMessage: 'No .afpt files found in the selected directory',
      path: getPrecomputePath(),
      dataExt: '.afpt',
      callback: async (files) => {
        const precomputePaths = [];
        const dbFiles = await listFiles(getDatabasePath(), '.pklz');
        files.reduce(
          (p, { fullname: filename }) =>
            p.then(async () =>
              precomputePaths.push(await processNewAnalysis(filename))
            ),
          Promise.resolve()
        );
        dbFiles.reduce(
          (p, { fullname: dbPath, basename: dbName }) =>
            p.then(() =>
              match(
                dbName,
                dbPath,
                precomputePaths.filter((precomputePath) => precomputePath)
              )
            ),
          Promise.resolve()
        );
        listFiles(getPrecomputePath(), '.afpt').then((mergedFiles) => {
          sendToMainWindow('precomputeListed', { files: mergedFiles });
        });
      },
    },
  };
  const manifest = manifests[object];
  const { filePaths, canceled } =
    (await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: manifest.title,
    })) || {};
  if (canceled) {
    return;
  }
  const newFiles = [];
  const [dir] = filePaths || [];
  const files = await listFiles(dir, manifest.dataExt);
  if (!files.length) {
    await dialog.showMessageBox({ message: manifest.emptyMessage });
  }
  await files.reduce(
    (p, { fullname: filename }) =>
      p.then(() => {
        const dest = join(manifest.path, basename(filename));
        newFiles.push({ fullname: dest });
        copySync(filename, dest);
      }),
    Promise.resolve()
  );
  await manifest.callback(newFiles);
});

ipcMain.on('search', async () => {
  const files = await listFiles(getPrecomputePath(), '.json');
  const parsedMatches = [];
  await Promise.all(
    files.map(async ({ fullname: filename }) => {
      const contents = await readFile(filename, 'utf-8');
      const name = basename(filename, '.afpt');
      try {
        const analysis = JSON.parse(contents.toString());
        const { parsedMatchesByDatabase } = analysis || {};
        Object.keys(parsedMatchesByDatabase).forEach((database) => {
          parsedMatches.push({
            ...parsedMatchesByDatabase[database],
            database,
            name,
          });
        });
      } catch (parseError) {
        // ignore parse error
      }
    })
  );
  sendToMainWindow('matchesListed', { parsedMatches });
});

ipcMain.on('export', async (event, { object, filename: requestedFilename }) => {
  const manifests = {
    databases: {
      title: 'Export databases',
      singularRemovalMessage:
        'Remove the exported database from Fingerprinter?',
      pluralRemovalMessage: 'Remove the exported databases from Fingerprinter?',
      path: getDatabasePath(),
      dataExt: '.pklz',
      metadataExt: '.txt',
      callback: (files) => {
        sendToMainWindow('databasesListed', { files });
      },
    },
    analyses: {
      title: 'Export analyses',
      singularRemovalMessage:
        'Remove the exported analysis from Fingerprinter?',
      pluralRemovalMessage: 'Remove the exported analyses from Fingerprinter?',
      path: getPrecomputePath(),
      dataExt: '.afpt',
      metadataExt: '.json',
      callback: (files) => {
        sendToMainWindow('precomputeListed', { files });
      },
    },
  };
  const manifest = manifests[object];
  const { filePaths, canceled } =
    (await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: requestedFilename
        ? `Export ${basename(requestedFilename, manifest.dataExt)}`
        : manifest.title,
    })) || {};
  const [dir] = filePaths || [];
  const files = await listFiles(manifest.path, manifest.dataExt);
  const filenames = [];
  files.forEach(({ fullname: filename }) => {
    if (requestedFilename && filename !== requestedFilename) {
      // if the user only requested export of a single object and not this object, do not stage this object for export
      return;
    }
    const metadataFilename = filename.replace(
      manifest.dataExt,
      manifest.metadataExt
    );
    filenames.push(filename);
    filenames.push(metadataFilename);
  });
  if (!canceled) {
    filenames.forEach((filename) => {
      try {
        copySync(filename, join(dir, basename(filename)));
      } catch (e) {
        // ignore copy error
      }
    });
    const { response } =
      (await dialog.showMessageBox({
        message:
          files.length > 1
            ? manifest.pluralRemovalMessage
            : manifest.singularRemovalMessage,
        buttons: ['Remove', 'Keep'],
      })) || {};
    if (response === 0) {
      // remove
      try {
        await Promise.all(filenames.map((filename) => rm(filename)));
      } catch (e) {
        // ignore remove error
      }
      listFiles(manifest.path, manifest.dataExt).then(manifest.callback);
    }
  }
});

ipcMain.on('openAudioFile', () => {
  dialog
    .showOpenDialog({
      properties: ['openFile', 'multiSelections'],
    })
    .then(async ({ filePaths }) => {
      const precomputePaths = [];
      await filePaths.reduce(
        (p, filename) =>
          p.then(async () =>
            precomputePaths.push(await processNewAnalysis(filename))
          ),
        Promise.resolve()
      );
      const dbFiles = await listFiles(getDatabasePath(), '.pklz');
      dbFiles.reduce(
        (p, { fullname: dbPath, basename: dbName }) =>
          p.then(() =>
            match(
              dbName,
              dbPath,
              precomputePaths.filter((precomputePath) => precomputePath)
            )
          ),
        Promise.resolve()
      );
      listFiles(getPrecomputePath(), '.afpt').then((files) => {
        sendToMainWindow('precomputeListed', { files });
      });
    });
});

ipcMain.on('storeDatabase', async (event, options) => {
  const { cwd, filenames, cores, name } = options || {};
  const dbPath = join(getDatabasePath(), `${name}.pklz`);
  const precomputeFiles = await listFiles(getPrecomputePath(), '.afpt');
  const precomputePaths = precomputeFiles.map(
    ({ fullname: precomputePath }) => precomputePath
  );
  let code;
  if (cwd) {
    code = getAudfprintScriptForDir(cwd, [
      'new',
      '-C',
      '-H',
      cores,
      '-d',
      dbPath,
      ...filenames,
    ]);
  } else {
    code = getAudfprintScript([
      'new',
      '-C',
      '-H',
      cores,
      '-d',
      dbPath,
      ...filenames,
    ]);
  }
  await sendPythonOutput('Fingerprinting...', code);
  await processNewDatabase(dbPath, precomputePaths);
  listFiles(getDatabasePath(), '.pklz').then((files) => {
    sendToMainWindow('databasesListed', { files });
  });
});

ipcMain.on('merge', async (event, { incomingDbs, filename }) => {
  const code = getAudfprintScript(
    ['merge', '-d', filename].concat(incomingDbs)
  );
  await sendPythonOutput('Merging...', code);
  await processNewDatabase(filename, []);
});

ipcMain.on('checkDependencies', () => checkDependencies());

// autoUpdater.on('download-progress', (progress) => {
//   sendToMainWindow('updateDownloadProgress', progress);
// });

// autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
//   const dialogOpts = {
//     type: 'info',
//     buttons: ['Restart', 'Later'],
//     title: 'Application Update',
//     message: process.platform === 'win32' ? releaseNotes : releaseName,
//     detail: 'A new version has been downloaded. Restart the application to apply the updates.',
//   };
//
//   dialog.showMessageBox(dialogOpts).then((returnValue) => {
//     if (returnValue.response === 0) {
//       autoUpdater.quitAndInstall();
//     }
//   });
// });

// ipcMain.on('quitAndInstall', () => {
//   autoUpdater.quitAndInstall();
// });
