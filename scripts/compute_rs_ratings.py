#!/usr/bin/env python3
"""
IBD Relative Strength Rating Calculator (1-99 Percentile)

Background script that:
1. Reads the Finviz stock universe from .finviz-cache.json
2. Fetches 1-year historical data in batches via yfinance
3. Filters stocks by volume > 100k and price > $1 from fetched data
4. Calculates IBD raw scores using weighted momentum formula
5. Ranks all stocks into 1-99 percentile ratings
6. Saves results to market_rs_ratings.json for instant O(1) lookups

Can be run with --resume to continue from a partial run.
"""

import json
import os
import sys
import time
import math
import logging
from datetime import datetime
from pathlib import Path

import yfinance as yf

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [RS] %(levelname)s %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger(__name__)

FINVIZ_CACHE = Path('.finviz-cache.json')
OUTPUT_FILE = Path('market_rs_ratings.json')
PARTIAL_FILE = Path('.rs_partial_scores.json')
BATCH_SIZE = 100
MIN_HISTORY_DAYS = 63
MIN_VOLUME = 100_000
MIN_PRICE = 1.0


def load_universe() -> list[str]:
    if not FINVIZ_CACHE.exists():
        log.error("Finviz cache not found at %s", FINVIZ_CACHE)
        sys.exit(1)

    with open(FINVIZ_CACHE, 'r') as f:
        cache = json.load(f)

    data = cache.get('data', {})
    tickers = set()

    for sector_data in data.values():
        for stock_list in sector_data.get('stocks', {}).values():
            for stock in stock_list:
                symbol = stock.get('symbol', '')
                if symbol and '.' not in symbol:
                    tickers.add(symbol.upper())

    return sorted(tickers)


def calculate_ibd_raw_score(closes: list[float]) -> float | None:
    if not closes or len(closes) < MIN_HISTORY_DAYS:
        return None

    current = closes[-1]
    if not current or current <= 0:
        return None

    length = len(closes)

    def get_perf(days_back: int) -> float | None:
        idx = length - 1 - days_back
        if idx < 0:
            return None
        past = closes[idx]
        if not past or past <= 0:
            return None
        return ((current - past) / past) * 100

    p3 = get_perf(63)
    if p3 is None:
        return None

    p6 = get_perf(126)
    p9 = get_perf(189)
    p12 = get_perf(252)

    total_weight = 0.4
    weighted_sum = 0.4 * p3

    if p6 is not None:
        weighted_sum += 0.2 * p6
        total_weight += 0.2
    if p9 is not None:
        weighted_sum += 0.2 * p9
        total_weight += 0.2
    if p12 is not None:
        weighted_sum += 0.2 * p12
        total_weight += 0.2

    return weighted_sum / total_weight


def fetch_and_score_batch(tickers: list[str]) -> dict[str, float]:
    scores = {}
    joined = ' '.join(tickers)

    try:
        data = yf.download(
            joined,
            period='1y',
            interval='1d',
            group_by='ticker',
            progress=False,
            threads=True
        )

        if data.empty:
            return scores

        for sym in tickers:
            try:
                if len(tickers) == 1:
                    df = data
                else:
                    if sym not in data.columns.get_level_values(0):
                        continue
                    df = data[sym]

                if df.empty:
                    continue

                clean = df.dropna(subset=['Close', 'Volume'])
                if clean.empty or len(clean) < MIN_HISTORY_DAYS:
                    continue

                last_price = float(clean['Close'].iloc[-1])
                recent_vol = float(clean['Volume'].tail(20).mean())

                if last_price < MIN_PRICE or recent_vol < MIN_VOLUME:
                    continue

                closes = clean['Close'].tolist()
                score = calculate_ibd_raw_score(closes)

                if score is not None:
                    scores[sym] = round(score, 4)

            except Exception:
                continue

    except Exception as e:
        log.warning("Batch download failed: %s", str(e)[:120])

    return scores


def compute_percentile_ratings(raw_scores: dict[str, float]) -> dict[str, int]:
    if not raw_scores:
        return {}

    sorted_items = sorted(raw_scores.items(), key=lambda x: x[1])
    total = len(sorted_items)
    ratings = {}

    for rank, (symbol, score) in enumerate(sorted_items):
        percentile = math.ceil(((rank + 1) / total) * 99)
        percentile = max(1, min(99, percentile))
        ratings[symbol] = percentile

    return ratings


def main():
    start_time = time.time()
    resume = '--resume' in sys.argv

    tickers = load_universe()
    log.info("Universe: %d tickers", len(tickers))

    all_scores: dict[str, float] = {}
    processed_set: set[str] = set()

    if resume and PARTIAL_FILE.exists():
        with open(PARTIAL_FILE) as f:
            partial = json.load(f)
        all_scores = partial.get('scores', {})
        processed_set = set(partial.get('processed', []))
        log.info("Resuming: %d scores, %d processed", len(all_scores), len(processed_set))

    remaining = [t for t in tickers if t not in processed_set]
    log.info("Remaining: %d tickers to process", len(remaining))

    total_batches = math.ceil(len(remaining) / BATCH_SIZE)

    for i in range(0, len(remaining), BATCH_SIZE):
        batch_num = (i // BATCH_SIZE) + 1
        batch = remaining[i:i + BATCH_SIZE]

        scores = fetch_and_score_batch(batch)
        all_scores.update(scores)
        processed_set.update(batch)

        log.info(
            "  Batch %d/%d: +%d scored | Total: %d/%d",
            batch_num, total_batches, len(scores), len(all_scores), len(processed_set)
        )

        if batch_num % 5 == 0:
            with open(PARTIAL_FILE, 'w') as f:
                json.dump({'scores': all_scores, 'processed': list(processed_set)}, f)

        if batch_num < total_batches:
            time.sleep(0.15)

    ratings = compute_percentile_ratings(all_scores)

    for sym in ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META']:
        if sym in ratings:
            log.info("  %s: RS=%d (raw=%.2f%%)", sym, ratings[sym], all_scores.get(sym, 0))

    output = {
        'ratings': ratings,
        'metadata': {
            'computedAt': datetime.utcnow().isoformat() + 'Z',
            'totalStocksScored': len(ratings),
            'totalTickersInUniverse': len(tickers),
            'totalSkipped': len(tickers) - len(ratings),
            'computeTimeSeconds': round(time.time() - start_time, 1),
        }
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f)

    if PARTIAL_FILE.exists():
        PARTIAL_FILE.unlink()

    elapsed = time.time() - start_time
    log.info("DONE: %d stocks rated in %.0fs", len(ratings), elapsed)


if __name__ == '__main__':
    main()
