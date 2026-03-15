from pathlib import Path

import pytest
from dotenv import load_dotenv

# Load .env from repo root, overriding any existing env vars
load_dotenv(Path(__file__).parent.parent.parent / ".env", override=True)


# Automatically mark evals so they are not run together with unit tests
def pytest_collection_modifyitems(items: list[pytest.Item]):
    for item in items:
        if item.name.startswith("eval_"):
            item.add_marker(pytest.mark.eval)


def pytest_addoption(parser: pytest.Parser):
    parser.addoption(
        "--runs", type=int, default=1, help="Number of times to run each eval case"
    )
    parser.addoption(
        "--concurrency",
        type=int,
        default=10,
        help="Maximum number of concurrent API calls",
    )
