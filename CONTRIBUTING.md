# Contributing to Praxis Agent

Thanks for your interest in contributing. This project was built for the [lablab.ai AI Trading Agents Hackathon](https://lablab.ai/ai-hackathons/ai-trading-agents) and is open to community contributions.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/javierdejesusda/praxis-agent.git
cd praxis-agent

# Install Python dependencies
pip install -e ".[dev]"

# Install dashboard dependencies
cd dashboard && npm install && cd ..

# Copy the example env and fill in your keys
cp .env.example .env

# Run the tests
pytest
```

## Development Workflow

1. Fork the repository and create a feature branch from `main`.
2. Make your changes following the code style below.
3. Run `pytest` to ensure nothing is broken.
4. Submit a pull request with a clear description of the change.

## Code Style

- **Python**: Google Style Guide. Google-style docstrings (`Args:`, `Returns:`, `Raises:`). Imports grouped: stdlib, third-party, local. No banner/decorator comments.
- **TypeScript/React**: Google TypeScript style. Explicit types, consistent formatting.
- All LLM outputs must use Pydantic typed schemas.
- The LLM can never override the risk governor.

## Backtest Integrity

If your change modifies anything in the signal pipeline, risk governor, feature engine, or backtester:

1. Run `python scripts/final_report.py` and compare IS/OOS metrics before and after.
2. Do not tune parameters on OOS data (post-2023-01-01). All optimization must use IS data only.
3. Include the before/after metrics in your PR description.

## Reporting Issues

Open an issue with:
- A clear title describing the problem.
- Steps to reproduce.
- Expected vs actual behavior.
- Python/Node version and OS.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
