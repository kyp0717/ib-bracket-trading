import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { makeSuite } from '../../suite';

const { pass, fail, summary } = makeSuite('ticks 03 live bar source in ast');
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

interface Call {
  name: string;
  args: string[];
}

function callsOf(file: string): Call[] {
  const text = readFileSync(join(root, file), 'utf8');
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: Call[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text
        : ts.isIdentifier(callee) ? callee.text : '';
      if (name) found.push({ name, args: n.arguments.map((a) => a.getText()) });
    }
    ts.forEachChild(n, walk);
  };
  walk(src);
  return found;
}

const chartCalls = callsOf('chart.ts');
const ibCalls = callsOf('ib.ts');

if (!chartCalls.some((c) => c.name === 'reqRealTimeBars'))
  pass('chart.ts builds no bar from the 5s realtime feed');
else
  fail('chart.ts builds no bar from the 5s realtime feed', 'found a reqRealTimeBars call');

if (chartCalls.some((c) => c.name === 'reqHistoricalData' && c.args[4] === 'BarSizeSetting.SECONDS_TEN' && c.args[8] === 'true'))
  pass('chart.ts streams the live 10s bar directly with keepUpToDate');
else
  fail('chart.ts streams the live 10s bar directly with keepUpToDate', 'no SECONDS_TEN request with keepUpToDate true');

if (ibCalls.some((c) => c.name === 'on' && c.args[0] === 'EventName.historicalDataUpdate' && /chart\.onHistoricalDataUpdate\(/.test(c.args[1] ?? '')))
  pass('ib.ts wires historicalDataUpdate into chart.onHistoricalDataUpdate');
else
  fail('ib.ts wires historicalDataUpdate into chart.onHistoricalDataUpdate', 'handler missing or not calling the chart');

summary();
