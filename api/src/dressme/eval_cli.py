"""Custom eval CLI for dressme, replacing pytest for evals."""

import asyncio
import importlib.util
import json
import traceback
from pathlib import Path
from typing import Annotated

import typer

from dressme.eval import EvalSummary, Status, Timer

app = typer.Typer(
    name="evals",
    help="Run dressme evals.",
    no_args_is_help=False,
)

EVALS_DIR = Path(__file__).parent.parent.parent / "evals"


def discover_eval_files(paths: list[Path]) -> list[Path]:
    """Find eval files from given paths or default evals/ directory."""
    if not paths:
        if not EVALS_DIR.is_dir():
            typer.echo(f"Evals directory not found: {EVALS_DIR}", err=True)
            raise typer.Exit(2)
        return sorted(
            p
            for p in EVALS_DIR.iterdir()
            if p.is_file() and p.suffix == ".py" and not p.name.startswith("_")
        )

    result: list[Path] = []
    for path in paths:
        if path.is_file() and path.suffix == ".py":
            result.append(path)
        elif path.is_dir():
            result.extend(
                sorted(
                    p
                    for p in path.iterdir()
                    if p.is_file() and p.suffix == ".py" and not p.name.startswith("_")
                )
            )
        else:
            typer.echo(f"Not a valid eval file or directory: {path}", err=True)
            raise typer.Exit(2)
    return result


def load_eval_module(path: Path) -> object:
    """Import an eval file as a module."""
    spec = importlib.util.spec_from_file_location(path.stem, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def format_status(status: Status) -> str:
    if status == Status.PASS:
        return "\033[32m✓\033[0m"  # green
    elif status == Status.FAIL:
        return "\033[31m✗\033[0m"  # red
    else:
        return "\033[33m!\033[0m"  # yellow


def print_results(summary: EvalSummary, verbose: bool = False) -> None:
    """Print formatted results table."""
    typer.echo(f"\n\033[1m{summary.name}\033[0m")
    typer.echo(f"{'Expected':<14} {'Predicted':<14} {'Status':<8} {'Name'}")
    typer.echo("-" * 70)

    for r in sorted(summary.results, key=lambda r: r.name):
        predicted_str = r.predicted or "(none)"
        status_str = format_status(r.status)
        timing = f"  ({r.duration:.2f}s)" if verbose else ""
        typer.echo(
            f"{r.expected:<14} {predicted_str:<14} {status_str:<11} {r.name}{timing}"
        )
        if verbose and r.error:
            typer.echo(f"    Error: {r.error}")

    # Summary line
    parts: list[str] = []
    if summary.passed:
        parts.append(f"\033[32m{len(summary.passed)} passed\033[0m")
    if summary.failed:
        parts.append(f"\033[31m{len(summary.failed)} failed\033[0m")
    if summary.errors:
        parts.append(f"\033[33m{len(summary.errors)} error\033[0m")

    accuracy_str = f"{summary.accuracy:.1%}"
    if summary.threshold is not None:
        threshold_str = f"{summary.threshold:.0%}"
        if summary.threshold_met:
            accuracy_str += f" (threshold: {threshold_str} \033[32m✓\033[0m)"
        else:
            accuracy_str += f" (threshold: {threshold_str} \033[31m✗\033[0m)"

    typer.echo(f"\n{', '.join(parts)} | accuracy: {accuracy_str} | {summary.duration:.1f}s")


@app.command()
def main(
    paths: Annotated[
        list[Path] | None,
        typer.Argument(
            help="Eval files or directories to run. Defaults to evals/.",
            exists=True,
        ),
    ] = None,
    runs: Annotated[
        int,
        typer.Option("--runs", "-r", help="Number of times to run each eval case."),
    ] = 1,
    concurrency: Annotated[
        int,
        typer.Option(
            "--concurrency", "-c", help="Maximum number of concurrent API calls."
        ),
    ] = 10,
    pattern: Annotated[
        str | None,
        typer.Option("--match", "-k", help="Only run cases matching this substring."),
    ] = None,
    verbose: Annotated[
        bool,
        typer.Option("--verbose", "-v", help="Show per-case timing and error details."),
    ] = False,
    list_evals: Annotated[
        bool,
        typer.Option("--list", "-l", help="List available evals without running them."),
    ] = False,
    json_output: Annotated[
        bool,
        typer.Option("--json", help="Output results as JSON."),
    ] = False,
) -> None:
    """Run evals with concurrency control and detailed reporting."""
    from dotenv import load_dotenv

    # Load .env from repo root
    load_dotenv(Path(__file__).parent.parent.parent.parent / ".env", override=True)

    eval_files = discover_eval_files(paths or [])

    if not eval_files:
        typer.echo("No eval files found.", err=True)
        raise typer.Exit(2)

    if list_evals:
        typer.echo("Available evals:")
        for f in eval_files:
            module = load_eval_module(f)
            threshold = getattr(module, "threshold", None)
            threshold_str = f" (threshold: {threshold:.0%})" if threshold is not None else ""
            typer.echo(f"  {f.stem}{threshold_str}")
        raise typer.Exit(0)

    summaries: list[EvalSummary] = []
    exit_code = 0

    for eval_file in eval_files:
        try:
            module = load_eval_module(eval_file)
        except Exception as e:
            typer.echo(f"Error loading {eval_file}: {e}", err=True)
            exit_code = 2
            continue

        run_fn = getattr(module, "run", None)
        if run_fn is None:
            typer.echo(f"Skipping {eval_file.stem}: no run() function found.", err=True)
            continue

        threshold = getattr(module, "threshold", None)

        with Timer() as timer:
            try:
                results = asyncio.run(
                    run_fn(runs=runs, concurrency=concurrency, pattern=pattern)
                )
            except Exception:
                typer.echo(f"\nError running {eval_file.stem}:", err=True)
                typer.echo(traceback.format_exc(), err=True)
                exit_code = 2
                continue

        summary = EvalSummary(
            name=eval_file.stem,
            results=results,
            threshold=threshold,
            duration=timer.duration,
        )
        summaries.append(summary)

        if not json_output:
            print_results(summary, verbose=verbose)

        if summary.failed:
            exit_code = max(exit_code, 1)
        if summary.errors:
            exit_code = max(exit_code, 2)
        if not summary.threshold_met:
            exit_code = max(exit_code, 1)

    if json_output:
        output = [s.to_dict() for s in summaries]
        typer.echo(json.dumps(output, indent=2))
    elif len(summaries) > 1:
        # Print overall summary
        total_passed = sum(len(s.passed) for s in summaries)
        total_failed = sum(len(s.failed) for s in summaries)
        total_errors = sum(len(s.errors) for s in summaries)
        total_duration = sum(s.duration for s in summaries)

        parts: list[str] = []
        if total_passed:
            parts.append(f"\033[32m{total_passed} passed\033[0m")
        if total_failed:
            parts.append(f"\033[31m{total_failed} failed\033[0m")
        if total_errors:
            parts.append(f"\033[33m{total_errors} error\033[0m")

        typer.echo(f"\n\033[1mOverall\033[0m: {', '.join(parts)} | {total_duration:.1f}s")

    raise typer.Exit(exit_code)


if __name__ == "__main__":
    app()
