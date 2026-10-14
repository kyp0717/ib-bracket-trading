import { upload, evidenceKey, host } from '../../src/s3';

const file = process.argv[2];
if (file) {
  const uri = await upload(evidenceKey(file), (await import('node:fs')).readFileSync(file));
  console.log(uri ? 'EVIDENCE ' + uri : 'EVIDENCE local ' + host() + ' ' + file);
}
