import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { makeSuite } from '../../suite';

const { pass, fail, summary } = makeSuite('ticks 00 tape source is tick by tick');
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
const allCalls = [...chartCalls, ...ibCalls];

if (chartCalls.some((c) => c.name === 'reqTickByTickData' && /TickByTickDataType\.AllLast/.test(c.args[2] ?? '')))
  pass('chart.ts subscribes the tape via reqTickByTickData with AllLast');
else
  fail('chart.ts subscribes the tape via reqTickByTickData with AllLast',
    'no reqTickByTickData call with AllLast as third argument, got: ' +
    chartCalls.filter((c) => c.name === 'reqTickByTickData').map((c) => c.args.join(' ')).join('; '));

if (!allCalls.some((c) => c.name === 'reqMktData'))
  pass('reqMktData is not called anywhere in app source');
else
  fail('reqMktData is not called anywhere in app source', 'found a reqMktData call');

if (chartCalls.some((c) => c.name === 'cancelTickByTickData'))
  pass('cancelAll cancels the tape subscription');
else
  fail('cancelAll cancels the tape subscription', 'no cancelTickByTickData call in chart.ts');

if (ibCalls.some((c) => c.name === 'on' && c.args[0] === 'EventName.tickByTickAllLast' && /chart\.onTick\(/.test(c.args[1] ?? '')))
  pass('ib.ts wires tickByTickAllLast into chart.onTick');
else
  fail('ib.ts wires tickByTickAllLast into chart.onTick', 'handler missing or not calling chart.onTick');

summary();
