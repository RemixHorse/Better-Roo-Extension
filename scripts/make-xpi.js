import { execSync } from 'child_process';
import { existsSync, rmSync, renameSync } from 'fs';

const XPI = 'better-roo.xpi';
if (existsSync(XPI)) rmSync(XPI);

if (process.platform === 'win32') {
  execSync('powershell Compress-Archive -Path dist-firefox\\* -DestinationPath better-roo.zip');
  renameSync('better-roo.zip', XPI);
} else {
  execSync(`cd dist-firefox && zip -r ../${XPI} .`);
}

console.log(`Created ${XPI}`);
