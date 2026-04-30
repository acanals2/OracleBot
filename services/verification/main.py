"""OracleBot verification API — DNS gate + production refusal + audit trail."""

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from audit import append_audit
from dns_verify import assess_production_risk, verify_dns_txt

app = FastAPI(title="OracleBot Verification", version="0.1.0")


class DnsVerifyRequest(BaseModel):
    domain: str = Field(..., description="Customer host or zone, e.g. staging.acme.com")
    expected_txt: str = Field(..., description='TXT value must contain this string, e.g. "oraclebot-verify=abc"')
    operator_id: Optional[str] = Field(None, description="Attributable operator for audit trail")
    manual_staging_ack: bool = Field(
        False,
        description="Operator confirms target is staging despite heuristics; requires reason + operator_id",
    )
    manual_staging_reason: Optional[str] = Field(None, description="Why this host is non-production")


class DnsVerifyResponse(BaseModel):
    verified: bool
    dns_match: bool
    production_allowed: bool
    production_reasons: List[str]
    txt_status: str
    audit_id: str
    notes: List[str]


class OAuthPlaceholderRequest(BaseModel):
    issuer_hint: Optional[str] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/verify/oauth")
def verify_oauth(_body: OAuthPlaceholderRequest) -> dict[str, Any]:
    """V0: OAuth verification not implemented — callers must use DNS."""
    audit_id = append_audit(
        "oauth_not_implemented",
        {"operator_id": None, "detail": "oauth_stub"},
    )
    raise HTTPException(
        status_code=501,
        detail={
            "message": "OAuth ownership verification is not implemented in V0. Use POST /verify/dns.",
            "audit_id": audit_id,
        },
    )


@app.post("/verify/dns", response_model=DnsVerifyResponse)
def verify_dns(body: DnsVerifyRequest) -> DnsVerifyResponse:
    domain = body.domain.strip().lower().rstrip(".")
    notes: list[str] = []

    prod = assess_production_risk(
        domain,
        manual_staging_ack=body.manual_staging_ack,
        manual_reason=body.manual_staging_reason,
        operator_id=body.operator_id,
    )

    if body.manual_staging_ack and not (
        body.operator_id and body.manual_staging_reason and body.manual_staging_reason.strip()
    ):
        audit_id = append_audit(
            "refused_manual_ack_invalid",
            {
                "domain": domain,
                "operator_id": body.operator_id,
                "reason": "manual_ack_requires_operator_id_and_reason",
            },
        )
        return DnsVerifyResponse(
            verified=False,
            dns_match=False,
            production_allowed=False,
            production_reasons=["manual_ack_requires_operator_id_and_reason"],
            txt_status="skipped",
            audit_id=audit_id,
            notes=notes + ["Manual staging ack requires operator_id and manual_staging_reason."],
        )

    if not prod.allowed:
        audit_id = append_audit(
            "refused_production_suspected",
            {
                "domain": domain,
                "operator_id": body.operator_id,
                "production_reasons": prod.reasons,
            },
        )
        return DnsVerifyResponse(
            verified=False,
            dns_match=False,
            production_allowed=False,
            production_reasons=prod.reasons,
            txt_status="skipped",
            audit_id=audit_id,
            notes=notes
            + [
                "Target refused: production-like host without staging markers or valid operator ack.",
            ],
        )

    ok_txt, txt_status = verify_dns_txt(domain, body.expected_txt)
    verified = ok_txt and prod.allowed

    event = "verified_dns" if verified else "refused_txt_mismatch"
    audit_id = append_audit(
        event,
        {
            "domain": domain,
            "operator_id": body.operator_id,
            "dns_match": ok_txt,
            "txt_status": txt_status,
            "production_reasons": prod.reasons,
            "used_operator_override": prod.used_operator_override,
        },
    )

    if prod.used_operator_override:
        notes.append("Production heuristic overridden by operator with logged reason.")

    return DnsVerifyResponse(
        verified=verified,
        dns_match=ok_txt,
        production_allowed=prod.allowed,
        production_reasons=prod.reasons,
        txt_status=txt_status,
        audit_id=audit_id,
        notes=notes,
    )
