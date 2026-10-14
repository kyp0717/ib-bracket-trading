import type { ScannerSubscription } from "@stoqey/ib";
import { ScanCode } from "@stoqey/ib";

export interface Preset {
  name: string;
  label: string;
  subscription?: ScannerSubscription;
  symbols?: string[];
}

const usStocks = {
  instrument: "STK" as unknown as import("@stoqey/ib").Instrument,
  locationCode: "STK.US.MAJOR" as unknown as import("@stoqey/ib").LocationCode,
};

const liquidLargeCaps = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "LLY", "JPM",
  "V", "UNH", "XOM", "JNJ", "PG", "HD", "BAC", "MA", "COST", "DIS",
  "WMT", "CVX", "MRK", "PEP", "ABT", "ORCL", "AMD", "CSCO", "IBM", "NFLX",
  "CRM", "PLTR", "QCOM", "AMGN", "TXN", "AMAT", "CAT", "GE", "BA", "MCD",
  "NKE", "SBUX", "UPS", "F", "GM", "DE", "SCHW", "MS",
  "KO", "PFE", "WFC", "VZ", "T", "BMY", "KHC", "KMI", "O", "MRO",
  "SO", "DAL", "AAL", "CCL", "NOK", "VALE", "HPQ",
];

export const presets: Record<string, Preset> = {
  universe: {
    name: "universe",
    label: "Built-in liquid large cap universe",
    symbols: liquidLargeCaps,
  },
  "most-active": {
    name: "most-active",
    label: "Most active US stocks (IB scanner, needs market data subscription)",
    subscription: { ...usStocks, scanCode: "MOST_ACTIVE" as unknown as ScanCode, numberOfRows: 25 },
  },
  "top-gainers": {
    name: "top-gainers",
    label: "Top percent gainers (IB scanner, needs market data subscription)",
    subscription: { ...usStocks, scanCode: "TOP_PERC_GAIN" as unknown as ScanCode, numberOfRows: 25, abovePrice: 5 },
  },
  "hot-by-volume": {
    name: "hot-by-volume",
    label: "Hot by volume (IB scanner, needs market data subscription)",
    subscription: { ...usStocks, scanCode: "HOT_BY_VOLUME" as unknown as ScanCode, numberOfRows: 25, abovePrice: 5 },
  },
  "trade-rate": {
    name: "trade-rate",
    label: "Top trade rate (IB scanner, needs market data subscription)",
    subscription: { ...usStocks, scanCode: "TOP_TRADE_RATE" as unknown as ScanCode, numberOfRows: 25, abovePrice: 5 },
  },
};

export function presetNames(): string[] {
  return Object.keys(presets);
}
