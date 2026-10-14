import { presetNames, presets } from "./presets";
import { runScan, ScannerDisabledError } from "./scan";
import { rank } from "./rank";

function argVal(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const presetName = argVal("--preset", "most-active");
const port = Number(argVal("--ibport", "4001"));
const rows = Number(argVal("--rows", "20"));
const json = process.argv.includes("--json");

if (process.argv.includes("--list")) {
  console.log(presetNames().join("\n"));
  process.exit(0);
}

const preset = presets[presetName];
if (!preset) {
  console.error(`unknown preset ${presetName}; available: ${presetNames().join(", ")}`);
  process.exit(2);
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (n: number) => (n * 100).toFixed(2) + "%";

try {
  const candidates = rank(await runScan(port, preset, rows, 8000, json ? undefined : (s) => process.stderr.write(s + " ")));
  if (!json) process.stderr.write("\n");
  if (json) {
    console.log(JSON.stringify({ preset: presetName, scannedAt: new Date().toISOString(), candidates }, null, 2));
  } else {
    console.log(`${preset.label} via 127.0.0.1:${port}`);
    console.log("SCORE SYM      PRICE     $VOL20     RANGE20  FLAGS");
    for (const c of candidates) {
      console.log(
        `${String(c.score).padStart(4)}  ${c.symbol.padEnd(6)} ${fmt(c.close).padStart(8)}  ${fmt(c.avgDollarVolume).padStart(11)}  ${pct(c.avgRangePct).padStart(8)}  ${c.reasons.join("; ")}`,
      );
    }
  }
} catch (e) {
  if (e instanceof ScannerDisabledError) {
    console.error("IB market scanner is disabled on this account (missing market data subscription).");
    console.error("Use the built-in universe instead: npx tsx scanner/cli.ts --ibport " + port + " --preset universe");
    console.error("or subscribe to a US stock market data bundle to unlock scanner presets.");
  } else {
    console.error("scan failed: " + String(e));
  }
  process.exit(1);
}
