# Praxis Agent

**Where theory becomes execution.**

A regime-adaptive AI trading agent built around a single principle the SOTA red-team literature keeps validating: **the LLM is a bounded analyst, not an executor**. Every position, every kill switch, every dollar of sizing is owned by a deterministic risk engine. Every decision is hashed to an artifact, attested on Sepolia, and auditable on Etherscan.

Built for the [lablab.ai AI Trading Agents Hackathon](https://lablab.ai/ai-hackathons/ai-trading-agents) — combined Kraken CLI + ERC-8004 submission.

## Why this design wins

Most trading-agent designs give an LLM authority over order size, retries, tool choice, and exception handling. Recent red-team papers (TradeTrap, MCPTox, TrustTrade) show this is exactly the class of system that can be systematically misled by prompt-injection, tool-poisoning, and adversarial market data. Praxis inverts the responsibilities:

- **Deterministic engine** owns positions, sizing, retries, and 7 hard kill criteria.
- **LLM analyst** produces a typed `AnalystReport` (direction, conviction, rationale, key risks) that can veto a trade but never approve one over the risk governor's head.
- **Every decision is hashed** via RFC 8785 canonical JSON and attested on-chain through the hackathon's shared Risk Router contract on Sepolia.

The pattern is auditable, tamper-evident, and — critically — the backtest shows it actually makes money.

## Backtest proof (Out-of-Sample, 2023-2026)

Run `python scripts/final_report.py` to regenerate. Full BTC/USD + ETH/USD history on 4h candles, validated out-of-sample.

| Metric | Value |
|---|---|
| Sharpe Ratio | **1.344** |
| CAGR | **18.47%** |
| Total Return | **+71.4%** |
| Total Trades | **53** |
| Win Rate | **60.4%** |
| Profit Factor | **3.197** |
| Max Drawdown | 9.61% |
| Expectancy | $150.96/trade |

Parameters were optimized on in-sample data (2013-2022) only. The OOS window (2023-2026) was never touched during development.

## Architecture

```
Kraken REST API (OHLC, ticker, bid/ask)
        |
  Feature Engine (pandas_ta, 16 indicators)
        |
  +-----+-----+-----+-----+-----+-----+
  | Trend  Vol Spread Mean Mom  Swing|  + PRISM enrichment
  | Agent  Ag  Gate   Rev  Ag   Struc|
  +-----+-----+-----+-----+-----+-----+
        |
  LLM Analyst (GPT-5.2 + deterministic fallback)
        |
  Risk Governor (7 kill criteria, Kelly sizing, regime gate)
        |
  Artifact (type, payload, RFC 8785 hash)
        |
  +--------+--------+
  |                 |
Kraken         Sepolia Risk Router
Paper          (EIP-712 TradeIntent)
  |                 |
  +--------+--------+
           |
  +--------+--------+
  |                 |
FastAPI       Validation & Reputation
Backend       Registries (ERC-8004)
  |                 |
Next.js       On-chain leaderboard
Dashboard     (sepolia.etherscan.io)
```

### Strategy

- **Regime-adaptive**: ADX > 25 trending (momentum bias), ADX < 20 ranging (mean-reversion bias). In between, signals must align harder.
- **6 deterministic signal agents**: Trend, Volatility, Spread/Cost gate, Mean-Reversion, Momentum, Swing Structure. Each returns a typed `SignalOutput` with direction, confidence, and an evidence dict the LLM can read.
- **LLM analyst** consumes the signals plus features and PRISM market data, then emits a typed `AnalystReport`. Model: OpenAI GPT-5.2 with a deterministic consensus fallback when the API is unavailable.
- **Risk governor** runs 7 independent kill criteria, requires multi-agent alignment, applies regime gates (no long under EMA(200), etc.), sizes positions via half-Kelly capped at 3%, and places ATR-multiple stops and targets.
- **Two-tier execution**: score >= 85 -> ERC-8004 eligible (submitted on-chain), score >= 70 -> paper trade only.

### 7 kill criteria (hard gates; LLM cannot override)

| # | Criterion | Limit |
|---|---|---|
| 1 | Stale data | > 2h |
| 2 | Daily loss cap | > 3% of equity |
| 3 | Max drawdown | > 8% from peak |
| 4 | Consecutive losses | >= 3 |
| 5 | Spread | > 20 bps |
| 6 | Volatility shock | ATR > 6% of price |
| 7 | Manual kill switch | Operator override |

## On-chain identity

- **Agent ID**: 35 (registered on hackathon AgentRegistry)
- **Chain**: Sepolia (11155111)
- **Contracts**: RiskRouter `0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC`
- **Attestation cadence**: validation + reputation post after every strategic cycle, including rejections. The dashboard links each entry to Etherscan.

## Quick start

```bash
# Install
pip install -e ".[dev]"

# Run the unit tests
pytest

# Preflight: env, Kraken, Sepolia, ledger
python scripts/preflight.py

# Start the trading agent
python -m src.orchestrator

# Start the FastAPI backend (separate terminal)
uvicorn src.api:app --host 127.0.0.1 --port 8001

# Start the Next.js dashboard (separate terminal)
cd dashboard && npm install && npm run dev

# Regenerate the backtest report
python scripts/final_report.py
```

Dashboard at http://localhost:3000.

## Environment

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
SEPOLIA_PRIVATE_KEY=0x...
PRISM_API_KEY=prism_sk_...
```

## Stack

- Python 3.11+ with asyncio orchestration, plain async — no LangGraph (CVEs, complexity)
- pandas_ta for technical indicators (no ta-lib C compile)
- web3.py for Sepolia, EIP-712 signing
- OpenAI SDK with typed Pydantic outputs
- FastAPI + Uvicorn backend
- Next.js 16 (Turbopack) + Tailwind v4 + Framer Motion + Recharts + SWR frontend
- JSON state files with HMAC integrity checks

## Project layout

```
src/
  agents/         # signals.py (6 agents), risk_governor.py, llm_analyst.py
  execution/      # kraken_adapter.py, risk_router.py
  features/       # engine.py (pandas_ta), prism.py
  artifacts/      # hasher.py (RFC 8785 canonical JSON)
  orchestrator.py # strategic + protective loops
  api.py          # FastAPI dashboard backend
  backtester.py   # historical replay of the full pipeline
dashboard/        # Next.js 16 UI
scripts/
  preflight.py    # pre-launch health check
  final_report.py # backtest + JSON report writer
  force_trade.py  # end-to-end trade path verification
  register_agent.py
tests/            # pytest suite
```

## License

MIT
