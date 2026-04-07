# Aegis Agent

Regime-adaptive AI trading agent with deterministic risk governance and ERC-8004 on-chain validation.

Built for the [lablab.ai AI Trading Agents Hackathon](https://lablab.ai) — combines Kraken paper trading with EIP-712 signed TradeIntents on Sepolia via the shared Risk Router.

## Architecture

```
Market Data (Kraken REST API)
        |
  Feature Engine (pandas_ta, 16 indicators)
        |
  +-----+-----+----------+---------+
  |     |     |          |         |
Trend  Vol  Spread    Mean-Rev   PRISM
Agent  Agent  Gate     Agent     API
  |     |     |          |         |
  +-----+-----+----------+---------+
        |
  LLM Analyst (GPT-5.2 + deterministic fallback)
        |
  Risk Governor (7 kill criteria, Kelly sizing)
        |
  +-----+-----+
  |           |
Kraken      Risk Router
Paper       (EIP-712 on Sepolia)
  |           |
  +-----+-----+
        |
  Artifact Hashing (RFC 8785 + SHA-256)
        |
  +-----+-----+
  |           |
FastAPI     Validation
Backend     Attestation
  |           |
Next.js     Sepolia
Dashboard   On-chain
```

## Strategy

- **Regime-adaptive**: ADX > 25 = trending (momentum), ADX < 20 = ranging (mean-reversion)
- **4 deterministic signal agents**: Trend, Volatility, Spread/Cost gate, Mean-reversion
- **GPT-5.2 analyst** with structured JSON output and deterministic fallback
- **7 kill criteria**: Stale data, daily loss cap, max drawdown, consecutive losses, spread, exposure, kill switch
- **Half-Kelly position sizing**: Dynamic, capped at 3%, minimum 1% risk per trade
- **Two-tier execution**: Score >= 85 -> ERC-8004 on-chain, Score >= 70 -> paper trade

## Backtest Results (120 days, 4h candles)

| Metric | BTC/USD | ETH/USD |
|--------|---------|---------|
| Agent Return | +0.65% | -0.53% |
| Buy & Hold | -22.81% | -30.78% |
| **Alpha** | **+23.46%** | **+30.24%** |
| Max Drawdown | 0.62% | 0.53% |
| Sharpe Ratio | 1.43 | — |
| Trades | 5 | 3 |
| Win Rate | 60% | 33% |
| Profit Factor | 2.10 | — |

Combined portfolio: **+0.06% net positive** during a -23% to -31% market crash. **+26.85% average alpha** vs buy-and-hold.

## On-chain

- **Agent ID**: 35 (Sepolia)
- **Contracts**: RiskRouter `0xd6A6...FdBC`, AgentRegistry `0x97b0...0ca3`
- **Chain**: Sepolia (11155111)
- **Validation**: EIP-712 signed attestations posted after every decision

## Quick Start

```bash
# Install
pip install -e ".[dev]"

# Run tests
pytest

# Start the trading agent
python -m src.orchestrator

# Start the API (separate terminal)
uvicorn src.api:app --host 127.0.0.1 --port 8888

# Start the dashboard (separate terminal)
cd dashboard && npm install && npm run dev
```

Dashboard at http://localhost:3000

## Environment Variables

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
SEPOLIA_PRIVATE_KEY=0x...
PRISM_API_KEY=prism_sk_...
```

## Stack

- Python 3.11+ with asyncio orchestration
- pandas_ta for technical indicators
- web3.py for Sepolia (EIP-712 signing)
- OpenAI SDK (GPT-5.2)
- Pydantic for typed schemas
- FastAPI + Uvicorn for API
- Next.js 15 + Tailwind v4 + Recharts + Framer Motion for dashboard
- JSON files + HMAC for state persistence

## Risk Controls

| Control | Limit |
|---------|-------|
| Risk per trade | 1-3% (Kelly) |
| Max position | 10% of equity |
| Daily loss cap | 3% |
| Max drawdown | 8% |
| Consecutive losses | 3 max |
| Spread gate | < 20 bps |
| Stale data | < 2h |
| Kill switch | Manual override |

## License

MIT
