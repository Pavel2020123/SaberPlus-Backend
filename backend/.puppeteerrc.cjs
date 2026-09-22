const { join } = require('node:path');

module.exports = {
  // Keep the browser inside the build artifact, not a developer home directory.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
  'chrome-headless-shell': { skipDownload: true },
};
