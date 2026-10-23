import { makeSuite, live, waitFor, quote } from '../util/suite';
import { host, list, download } from '../../../src/s3';

const { pass, fail, summary } = makeSuite('ticks 05 audit reaches s3');
const { st, close } = live();

const needle = 'subscribe | tape QQQ reqTickByTickData AllLast';

async function inS3(): Promise<boolean> {
  const keys = await list(`audit/${host()}/${new Date().toISOString().slice(0, 10)}/`);
  for (const k of keys.slice(-8)) {
    const body = await download(k);
    if (body.includes(needle)) return true;
  }
  return false;
}

try {
  await quote(st, 'QQQ');
  await waitFor('audit line in s3', 20000, inS3);
  pass('audit line lands in the s3 audit trail');
} catch (e) {
  fail('suite aborted', String(e));
} finally {
  close();
}
summary();
