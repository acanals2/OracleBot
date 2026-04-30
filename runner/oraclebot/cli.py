"""Typer entrypoint for operator CLI."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
import httpx

from oraclebot.personas.trader import DEFAULT_MIX_EIGHT, instantiate_population
from oraclebot.report_gen import write_report
from oraclebot.run_controller import run_population
from oraclebot.verify_client import post_verify_dns
from oraclebot.workers.browser_stub import describe_browser_tier

app = typer.Typer(no_args_is_help=True, add_completion=False)


@app.command()
def verify(
    base_url: str = typer.Option("http://127.0.0.1:8000", help="Verification service base URL"),
    domain: str = typer.Option(..., help="Target hostname (staging)"),
    expected_txt: str = typer.Option(..., help="Substring required in _oraclebot TXT"),
    operator_id: Optional[str] = typer.Option(None),
    manual_ack: bool = typer.Option(False, help="Operator confirms staging despite heuristics"),
    reason: Optional[str] = typer.Option(None, help="Required with --manual-ack"),
) -> None:
    """Call POST /verify/dns on the verification service."""
    try:
        body = post_verify_dns(
            base_url,
            domain,
            expected_txt,
            operator_id=operator_id,
            manual_staging_ack=manual_ack,
            manual_staging_reason=reason,
        )
        typer.echo(json.dumps(body, indent=2))
        if not body.get("verified"):
            raise typer.Exit(code=2)
    except httpx.HTTPStatusError as e:
        typer.echo(e.response.text, err=True)
        raise typer.Exit(code=1) from e


@app.command("run")
def run_cmd(
    target: str = typer.Option(..., help="Base URL e.g. https://staging.acme.dev"),
    personas: int = typer.Option(32, help="Population size"),
    duration_sec: int = typer.Option(30, help="Run wall-clock duration"),
    rate_rpm: int = typer.Option(120, help="Global action rate cap (approx)"),
    dry_run: bool = typer.Option(False, help="Skip HTTP; synthetic latencies only"),
    seed: int = typer.Option(42),
    runs_dir: Path = typer.Option(Path("./runs"), help="Directory for run artifacts"),
    verify_base_url: Optional[str] = typer.Option(
        None,
        help="If set, call verification service before run",
    ),
    verify_domain: Optional[str] = typer.Option(None, help="Hostname for DNS verification"),
    verify_txt: Optional[str] = typer.Option(None, help="Expected TXT fragment"),
    operator_id: Optional[str] = typer.Option(None),
    manual_ack: bool = typer.Option(False),
    manual_reason: Optional[str] = typer.Option(None),
    skip_verify: bool = typer.Option(
        False,
        help="DANGEROUS: bypass verification gate (operator responsibility)",
    ),
    browser: bool = typer.Option(False, help="Reserved; browser tier is concierge-only in V0"),
) -> None:
    """Run trader personas against a verified staging target (API probes in V0 CLI)."""
    if browser:
        typer.echo(json.dumps(describe_browser_tier(), indent=2))

    if verify_base_url and verify_domain and verify_txt:
        body = post_verify_dns(
            verify_base_url,
            verify_domain,
            verify_txt,
            operator_id=operator_id,
            manual_staging_ack=manual_ack,
            manual_staging_reason=manual_reason,
        )
        if not body.get("verified"):
            typer.echo(json.dumps(body, indent=2), err=True)
            raise typer.Exit(code=2)
    elif not skip_verify:
        typer.echo(
            "Refusing run without verification. Pass --verify-base-url, "
            "--verify-domain, and --verify-txt matching the verification service, "
            "or explicitly use --skip-verify (not recommended).",
            err=True,
        )
        raise typer.Exit(code=3)

    population = instantiate_population(personas, DEFAULT_MIX_EIGHT, seed)
    out = run_population(
        target_base=target,
        personas=population,
        duration_sec=duration_sec,
        rate_rpm=rate_rpm,
        dry_run=dry_run,
        run_dir=runs_dir,
        seed=seed,
    )
    typer.echo(str(out))


@app.command()
def report(
    events: Path = typer.Option(..., exists=True, help="events.jsonl from run"),
    out: Path = typer.Option(Path("./report.md"), help="Output Markdown path"),
) -> None:
    """Generate a Markdown readiness report from an events.jsonl file."""
    write_report(events, out)
    typer.echo(str(out.resolve()))


def run_cli() -> None:
    app()


if __name__ == "__main__":
    run_cli()
