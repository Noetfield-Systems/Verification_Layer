"""Noetfield Verification Layer SDK.

Cryptographic proof that your AI agent's code is safe to deploy.

Usage:
    from noetfield import Client
    nf = Client(api_key="nf_live_...")
    result = nf.verify(artifact=code, artifact_type="code",
                       metadata={"source": "cursor", "project_id": "proj_123"})
    if result.verdict == "pass":
        print(f"Deploy token: {result.deploy_token}")
"""

from .client import Client, NoetfieldError
from .models import (
    ArtifactType,
    ArtifactSource,
    VerifyInput,
    VerifyResult,
    GateResult,
    TokenVerification,
    Receipt,
    ReceiptResponse,
)

__version__ = "1.0.0"
__all__ = [
    "Client",
    "NoetfieldError",
    "ArtifactType",
    "ArtifactSource",
    "VerifyInput",
    "VerifyResult",
    "GateResult",
    "TokenVerification",
    "Receipt",
    "ReceiptResponse",
]
