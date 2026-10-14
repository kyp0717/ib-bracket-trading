import { makeSuite } from '../../util/suite';
import { presets } from '../../../scanner/presets';
import { runScan } from '../../../scanner/scan';
import { rank } from '../../../scanner/rank';

const IB_PORT = Number(process.env.E2E_IB_PORT || 4001);

const { pass, fail, summary } = makeSuite('api 01 universe finds candidates');

try {
  const candidates = rank(await runScan(IB_PORT, presets.universe, 50, 15000));
  if (candidates.length >= 40) pass('universe scan returns most of the 49 symbols');
  else fail('universe scan returns most of the 49 symbols', `got ${candidates.length}`);

  if (candidates.every((c) => c.close > 0 && c.avgDollarVolume > 0 && c.avgRangePct > 0))
    pass('every candidate carries price, dollar volume, and range');
  else
    fail('every candidate carries price, dollar volume, and range', JSON.stringify(candidates.find((c) => !(c.close > 0 && c.avgDollarVolume > 0 && c.avgRangePct > 0))));

  let sorted = true;
  for (let i = 1; i < candidates.length; i++) if (candidates[i - 1].score < candidates[i].score) sorted = false;
  if (sorted) pass('candidates ranked by score descending');
  else fail('candidates ranked by score descending', 'order broken');

  if (new Set(candidates.map((c) => c.symbol)).size === candidates.length) pass('no duplicate symbols');
  else fail('no duplicate symbols', 'duplicates found');

  if (candidates.length && candidates[0].score >= 50) pass('top candidate scores at least 50');
  else fail('top candidate scores at least 50', `top=${candidates[0]?.score}`);
} catch (e) {
  fail('suite aborted', String(e));
}
summary();
