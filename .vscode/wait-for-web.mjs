// Sug ilaa website-ku (3001) iyo backend-ku (3000) diyaar noqdaan — kadib browser-ka ayaa furmaya
const urls = ['http://localhost:3000/api/v1/health', 'http://localhost:3001/login'];
const until = Date.now() + 10 * 60_000;
for (const url of urls) {
  for (;;) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* weli ma kicin */
    }
    if (Date.now() > until) {
      console.error(`✗ ${url} ma kicin — eeg terminal-ka Backend / Website`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`✓ ${url}`);
}
