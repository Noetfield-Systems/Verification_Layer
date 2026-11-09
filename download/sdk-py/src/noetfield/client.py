"""Noetfield SDK client."""

from __future__ import annotations

import os
from typing import Any, Dict, Optional, Union

import httpx
from pydantic import ValidationError

from .models import (
    ReceiptResponse,
    TokenVerification,
    VerifyInput,
    VerifyMetadata,
    VerifyResult,
)


class NoetfieldError(Exception):
    """Raised when the Noetfield API returns an error."""

    def __init__(self, message: str, code: str = "unknown", status: int = 0) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


DEFAULT_BASE_URL = "https://api.noetfield.com"


class Client:
    """Noetfield verification client.

    Args:
        api_key: API key starting with ``nf_live_``.
        base_url: Override the API base URL. Defaults to ``NOETFIELD_API_URL`` env
            or ``https://api.noetfield.com``.
        timeout: Request timeout in seconds. Default 30.
        transport: Optional httpx transport (for testing).
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        transport: Optional[httpx.BaseTransport] = None,
    ) -> None:
        if not api_key or not api_key.startswith("nf_live_"):
            raise NoetfieldError("api_key must start with 'nf_live_'", "invalid_api_key", 0)
        self.api_key = api_key
        self.base_url = (base_url or os.environ.get("NOETFIELD_API_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            transport=transport,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "noetfield-python-sdk/1.0.0",
            },
        )

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def verify(
        self,
        artifact: Union[str, Dict[str, str]],
        artifact_type: str = "code",
        metadata: Optional[Dict[str, Any]] = None,
        project_id: Optional[str] = None,
        source: str = "custom",
        model_identity: Optional[str] = None,
    ) -> VerifyResult:
        """Submit an artifact for verification.

        Args:
            artifact: Code/config string, or {path: contents} for multi-file.
            artifact_type: "code" | "workflow" | "config".
            metadata: Full metadata dict. If provided, overrides individual fields.
            project_id: Project ID. Required if metadata is None.
            source: "bolt" | "v0" | "cursor" | "custom".
            model_identity: Optional model identifier (e.g. "deepseek-coder-v2").

        Returns:
            VerifyResult with verdict, hash, gates, deploy_token, cost.

        Raises:
            NoetfieldError: On API error.
        """
        if metadata is None:
            if not project_id:
                raise NoetfieldError("project_id is required (or pass metadata dict)", "invalid_argument", 0)
            metadata = VerifyMetadata(
                source=source,  # type: ignore[arg-type]
                project_id=project_id,
                model_identity=model_identity,
            ).model_dump(by_alias=True, exclude_none=True)
        body = {
            "artifact": artifact,
            "artifact_type": artifact_type,
            "metadata": metadata,
        }
        data = self._request("POST", "/api/v1/verify", body)
        return VerifyResult.model_validate(data)

    def get_verification(self, job_id: str) -> VerifyResult:
        """Poll a verification job by id."""
        data = self._request("GET", f"/api/v1/verify/{job_id}")
        data.setdefault("job_id", job_id)
        return VerifyResult.model_validate(data)

    def get_receipt(self, verdict_hash: str) -> ReceiptResponse:
        """Fetch the full tamper-proof receipt by verdict hash. Public endpoint."""
        resp = self._client.get(f"/api/v1/receipt/{verdict_hash}")
        data = resp.json()
        if resp.status_code >= 400:
            err = data.get("error", {})
            raise NoetfieldError(err.get("message", "receipt not found"), err.get("code", "unknown"), resp.status_code)
        return ReceiptResponse.model_validate(data)

    def verify_token(self, deploy_token: str, artifact_hash: str) -> TokenVerification:
        """Verify a deploy token before deploying an artifact.

        Call from your infrastructure (Cloudflare/Railway/AWS) before deploy.
        """
        data = self._request("POST", "/api/v1/verify-token", {
            "deploy_token": deploy_token,
            "artifact_hash": artifact_hash,
        })
        return TokenVerification.model_validate(data)

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        try:
            resp = self._client.request(method, path, json=body)
        except httpx.HTTPError as e:
            raise NoetfieldError(f"network error: {e}", "network_error", 0) from e
        data = resp.json()
        if resp.status_code >= 400:
            err = data.get("error", {})
            raise NoetfieldError(err.get("message", "request failed"), err.get("code", "unknown"), resp.status_code)
        return data


def verify(
    artifact: Union[str, Dict[str, str]],
    api_key: str,
    project_id: str,
    source: str = "custom",
    artifact_type: str = "code",
    base_url: Optional[str] = None,
) -> VerifyResult:
    """Convenience: verify an artifact in one call."""
    with Client(api_key=api_key, base_url=base_url) as nf:
        return nf.verify(artifact=artifact, artifact_type=artifact_type, project_id=project_id, source=source)
