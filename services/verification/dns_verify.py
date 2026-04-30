"""DNS TXT verification and production-target heuristics."""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

import dns.name
import dns.resolver

# Hostname must suggest non-production, unless operator provides logged manual ack.
_STAGING_HINT = re.compile(
    r"(^|\.)("
    r"staging|stage|stg|dev|devel|development|test|testing|uat|qa|"
    r"preprod|preview|sandbox|demo|int|integration|localhost|"
    r"127\.0\.0\.1|internal|corp|vpn|lab"
    r")(\.|$)",
    re.IGNORECASE,
)


@dataclass
class ProductionAssessment:
    allowed: bool
    reasons: List[str]
    used_operator_override: bool


def host_has_staging_hint(host: str) -> bool:
    h = host.strip().lower().rstrip(".")
    return bool(_STAGING_HINT.search(h))


def resolve_public_ips(hostname: str) -> Tuple[List[str], List[str]]:
    """Returns (ipv4, ipv6) string lists from A / AAAA."""
    v4: List[str] = []
    v6: List[str] = []
    for rdtype in ("A", "AAAA"):
        try:
            ans = dns.resolver.resolve(hostname, rdtype, lifetime=5)
            for r in ans:
                if rdtype == "A":
                    v4.append(r.address)
                else:
                    v6.append(r.address)
        except dns.resolver.NXDOMAIN:
            return v4, v6
        except dns.resolver.NoAnswer:
            continue
        except dns.resolver.LifetimeTimeout:
            continue
    return v4, v6


def any_non_private_ip(v4: List[str], v6: List[str]) -> bool:
    for s in v4 + v6:
        try:
            ip = ipaddress.ip_address(s)
            if not ip.is_private and not ip.is_loopback and not ip.is_reserved:
                return True
        except ValueError:
            continue
    return False


def assess_production_risk(
    hostname: str,
    *,
    manual_staging_ack: bool,
    manual_reason: Optional[str],
    operator_id: Optional[str],
) -> ProductionAssessment:
    """
    Refuse likely-production targets. Manual ack is allowed only for operator-
    documented staging that doesn't match naming heuristics (logged in caller).
    """
    reasons: List[str] = []
    if host_has_staging_hint(hostname):
        return ProductionAssessment(True, reasons, False)

    v4, v6 = resolve_public_ips(hostname)
    if v4 or v6:
        if any_non_private_ip(v4, v6):
            reasons.append("hostname_lacks_staging_marker_and_resolves_to_public_ip")
        else:
            reasons.append("hostname_lacks_staging_marker")
    else:
        reasons.append("hostname_lacks_staging_marker_no_dns_a_aaaa")

    if manual_staging_ack and manual_reason and operator_id:
        reasons.append("operator_manual_staging_acknowledged")
        return ProductionAssessment(True, reasons, True)

    return ProductionAssessment(False, reasons, False)


def verify_dns_txt(domain: str, expected_fragment: str) -> Tuple[bool, str]:
    """
    Check _oraclebot.<domain> TXT records contain expected_fragment.
    expected_fragment should be the full token e.g. oraclebot-verify=abc123
    """
    fqdn = dns.name.from_text(f"_oraclebot.{domain}".rstrip("."))
    try:
        ans = dns.resolver.resolve(fqdn, "TXT", lifetime=8)
    except dns.resolver.NXDOMAIN:
        return False, "txt_nxdomain"
    except dns.resolver.NoAnswer:
        return False, "txt_no_answer"
    except dns.resolver.LifetimeTimeout:
        return False, "txt_timeout"
    except Exception as e:  # noqa: BLE001
        return False, f"txt_error:{type(e).__name__}"

    for r in ans:
        joined = b"".join(r.strings).decode("utf-8", errors="replace")
        if expected_fragment in joined:
            return True, "txt_match"
    return False, "txt_no_match"
