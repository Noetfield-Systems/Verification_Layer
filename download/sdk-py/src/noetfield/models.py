"""Pydantic models for the Noetfield SDK."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

ArtifactType = Literal["code", "workflow", "config"]
ArtifactSource = Literal["bolt", "v0", "cursor", "custom"]


class VerifyMetadata(BaseModel):
    source: ArtifactSource = "custom"
    project_id: str
    model_identity: Optional[str] = None
    extra: Dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "allow"}


class VerifyInput(BaseModel):
    artifact: Union[str, Dict[str, str]]
    artifact_type: ArtifactType = "code"
    metadata: VerifyMetadata


class GateResult(BaseModel):
    name: str
    passed: bool
    detail: str


class VerifyResult(BaseModel):
    job_id: str
    status: Literal["complete", "pending", "processing", "failed"]
    verdict: Optional[Literal["pass", "fail"]] = None
    verdict_hash: Optional[str] = None
    artifact_hash: Optional[str] = None
    gates: Optional[List[GateResult]] = None
    deploy_token: Optional[str] = None
    token_expiry: Optional[str] = None
    cost_usd: Optional[float] = None
    receipt_url: Optional[str] = None
    idempotent: bool = False


class TokenVerification(BaseModel):
    valid: bool
    expired: bool
    signature_valid: bool
    artifact_hash_matches: bool
    expiry: Optional[str] = None
    verdict_hash: Optional[str] = None
    reason: str


class ReceiptGate(BaseModel):
    index: int
    name: str
    passed: bool
    detail: str
    evidence: Optional[List[str]] = None


class ReceiptPolicy(BaseModel):
    version: int
    hash: str
    expected_hash: str


class ReceiptDeployToken(BaseModel):
    token: str
    expires_at: str
    expiry_unix: int


class Receipt(BaseModel):
    schema: str = Field(alias="schema")
    verdict_hash: str
    verdict: Literal["pass", "fail"]
    artifact_hash: str
    artifact_type: ArtifactType
    source: ArtifactSource
    project_id: str
    model_identity: Optional[str] = None
    policy: ReceiptPolicy
    gates: List[ReceiptGate]
    deploy_token: Optional[ReceiptDeployToken] = None
    cost_usd: float
    issued_at_unix: int
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class ReceiptResponse(BaseModel):
    receipt: Receipt
    signature: str
    signature_algorithm: str
    verification_url: str
    artifact_ref: Optional[str] = None
    project: Optional[Dict[str, str]] = None
    retrieved_at: str
