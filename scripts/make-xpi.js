import archiver from 'archiver';
import { createWriteStream, existsSync, rmSync } from 'fs';

const XPI = 'better-roo.xpi';
if (existsSync(XPI)) rmSync(XPI);

await new Promise((resolve, reject) => {
  const output = createWriteStream(XPI);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory('dist-firefox/', false);
  archive.finalize();
});

console.log(`Created ${XPI}`);
