# Aegis Agent - AI Trading Agent

## Project

lablab.ai AI Trading Agents hackathon. Combined Kraken CLI + ERC-8004 submission.
Regime-adaptive trading agent with dual execution (Kraken paper + Risk Router on-chain).

## Architecture

- **Plain Python async** — no LangGraph (CVEs, complexity)
- **OpenAI GPT** (latest, key in `.env`) with deterministic fallback
- **6 agents**: Data Auditor, Trend, Volatility, Spread/Cost, LLM Analyst, Risk Governor
- **Two-loop**: strategic (4h) + protective (1min, deterministic)
- **Dual execution**: Kraken CLI paper trades + EIP-712 signed TradeIntents to Risk Router on Sepolia

## Stack

- Python 3.11+, asyncio orchestration
- `pandas_ta` for indicators (NOT ta-lib)
- `web3.py` for Sepolia (NOT Hardhat)
- `openai` SDK for LLM analyst
- `pydantic` for typed schemas
- Kraken CLI via WSL subprocess
- Streamlit >= 1.54.0 for dashboard
- JSON files + HMAC for state (NOT SQLite)

## Strategy

- Regime-adaptive: ADX > 25 = momentum, ADX < 20 = mean-reversion
- BTC/USD primary, ETH/USD secondary
- Two-tier thresholds: 85+ for ERC-8004 validated, 70+ for Kraken paper
- Fixed 1% risk per trade, 3% daily loss cap, 8% max drawdown
- Real costs: 55+ bps round-trip (Kraken 0.25% maker / 0.40% taker)
- Trade only when expected edge > 82.5 bps

## Contracts (Sepolia, Chain ID 11155111)

- **RiskRouter**: `0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC`
- EIP-712 domain: `{ name: "RiskRouter", version: "1", chainId: 11155111 }`
- Caps: $500/trade, 10 trades/hour, 5% drawdown
- HackathonVault: 0.05 ETH per team
- Full ABIs: clone Stephen-Kimoi/ai-trading-agent-template → SHARED_CONTRACTS.md
- Validation scores are self-reported (0-100)

## Risk Governor (7 Kill Criteria)

1. Market snapshot stale (> 5 min)
2. Kraken CLI output malformed
3. Ledger mismatch (internal vs exchange)
4. Spread > 20 bps
5. Daily loss cap breached (3%)
6. Max drawdown breached (8%)
7. Kill switch manually activated

## Code Rules

- Google Style Guide for Python
- No banner/decorator comments
- Imports grouped: stdlib, third-party, local
- All LLM outputs use Pydantic typed schemas
- LLM can NEVER override risk governor
- All artifact hashes use canonical JSON (RFC 8785, sort_keys=True, fixed-precision)
- Thread lock for web3.py nonce management
- Never pass raw external text to LLM — extract numerics or sanitize first

## Security

- `.env` for all secrets (OpenAI key, Sepolia private key, PRISM key)
- Never commit `.env`, `secrets.toml`, `.claude/`, `*.sqlite`
- Pin all dependency versions
- Streamlit binds to 127.0.0.1 only
- Kraken CLI: minimum-privilege API keys, paper mode only
- Fresh Sepolia key for hackathon (never reuse)

## File Structure

```
aegis-agent/
  src/
    agents/         # Signal agents, LLM analyst, risk governor
    execution/      # Kraken CLI adapter, Risk Router adapter
    features/       # pandas_ta feature engine
    artifacts/      # Canonical JSON hashing, ERC-8004 submission
    dashboard/      # Streamlit app
  tests/
  .env              # NOT committed
  .gitignore
  pyproject.toml
  README.md
```

## Key Research Files (NOT committed to repo)

- `lablab-ai-trading-agents.md` — hackathon rules extraction
- `sota-red-team-research.md` — adversarial analysis
- `sota-sources-comprehensive.md` — 200+ sources with URLs
