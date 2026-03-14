"""Eval framework for dressme.

Convention: each eval file in evals/ has:
- An async `run(runs, concurrency)` function returning list[EvalResult]
- An optional module-level `threshold: float` (minimum accuracy to pass)
"""

import time
from dataclasses import dataclass, field
from enum import Enum


class Status(Enum):
    PASS = "pass"
    FAIL = "fail"
    ERROR = "error"


@dataclass
class EvalResult:
    """Result of a single eval case."""

    name: str
    expected: str
    predicted: str | None = None
    error: str | None = None
    duration: float = 0.0

    @property
    def status(self) -> Status:
        if self.error is not None:
            return Status.ERROR
        if self.predicted is None:
            return Status.ERROR
        if self.predicted == self.expected:
            return Status.PASS
        return Status.FAIL


@dataclass
class EvalSummary:
    """Aggregated results for one eval file."""

    name: str
    results: list[EvalResult] = field(default_factory=lambda: list[EvalResult]())
    threshold: float | None = None
    duration: float = 0.0

    @property
    def passed(self) -> list[EvalResult]:
        return [r for r in self.results if r.status == Status.PASS]

    @property
    def failed(self) -> list[EvalResult]:
        return [r for r in self.results if r.status == Status.FAIL]

    @property
    def errors(self) -> list[EvalResult]:
        return [r for r in self.results if r.status == Status.ERROR]

    @property
    def accuracy(self) -> float:
        if not self.results:
            return 0.0
        return len(self.passed) / len(self.results)

    @property
    def threshold_met(self) -> bool:
        if self.threshold is None:
            return True
        return self.accuracy >= self.threshold

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "accuracy": self.accuracy,
            "threshold": self.threshold,
            "threshold_met": self.threshold_met,
            "duration": round(self.duration, 2),
            "counts": {
                "total": len(self.results),
                "passed": len(self.passed),
                "failed": len(self.failed),
                "errors": len(self.errors),
            },
            "results": [
                {
                    "name": r.name,
                    "expected": r.expected,
                    "predicted": r.predicted,
                    "status": r.status.value,
                    "error": r.error,
                    "duration": round(r.duration, 3),
                }
                for r in sorted(self.results, key=lambda r: r.name)
            ],
        }


class Timer:
    """Context manager for timing."""

    def __init__(self) -> None:
        self.duration: float = 0.0

    def __enter__(self) -> "Timer":
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_: object) -> None:
        self.duration = time.perf_counter() - self._start
