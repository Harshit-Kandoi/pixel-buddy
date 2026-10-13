// Packs the built extension (out/extension) into a Chrome Web Store upload:
// release/pixel-buddy-extension-<version>.zip, with manifest.json at the zip root.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repo, 'out/extension');
if (!existsSync(resolve(source, 'manifest.json'))) throw new Error('Run `npm run ext:build` first.');
const { version } = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8'));

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);

// Minimal ZIP writer (deflate, no zip64): enough for a few hundred KB of extension files.
const local = [];
const central = [];
let offset = 0;
for (const file of files(source).sort()) {
  const name = Buffer.from(relative(source, file).split('\\').join('/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8 names
  header.writeUInt16LE(8, 8); // deflate
  header.writeUInt32LE(0x00210000, 10); // fixed 1980-01-01 timestamp: identical builds zip identically
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, packed);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  header.copy(entry, 8, 6, 26);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += header.length + name.length + packed.length;
}
const centralSize = central.reduce((sum, b) => sum + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(central.length / 2, 8);
end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(resolve(repo, 'release'), { recursive: true });
const output = resolve(repo, `release/pixel-buddy-extension-${version}.zip`);
writeFileSync(output, Buffer.concat([...local, ...central, end]));
console.log(`Wrote ${relative(repo, output)} (${central.length / 2} files)`);
