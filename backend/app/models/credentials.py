"""Credential models for each cloud provider.

Credentials are accepted per request and may be persisted in the local
deployment store for restart durability.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, SecretStr


class AzureCredentials(BaseModel):
    """Azure service principal or user credentials.

    The frontend sends these after the user enters them in the credential
    form.  For service-principal auth all four fields are required.
    For interactive / CLI-based auth the backend can fall back to
    ``DefaultAzureCredential`` if these are omitted.

    Length constraints are intentionally omitted so the mock/test mode
    can accept placeholder values.  The Azure SDK itself will reject
    invalid UUIDs at authentication time in production.
    """

    provider: Literal["azure"] = "azure"

    subscription_id: str = Field(..., description="Azure subscription ID (UUID)", min_length=1)
    tenant_id: str = Field(..., description="Azure AD tenant ID (UUID)", min_length=1)
    client_id: str = Field(
        ...,
        description="Service principal / app registration client ID (UUID)",
        min_length=1,
    )
    client_secret: SecretStr = Field(..., description="Service principal client secret")


class GCPCredentials(BaseModel):
    """Google Cloud Platform credentials (placeholder for future use)."""

    provider: Literal["gcp"] = "gcp"

    project_id: str = Field(..., description="GCP project ID")
    service_account_json: SecretStr = Field(
        ..., description="Service account key JSON (stringified)"
    )


class AWSCredentials(BaseModel):
    """Amazon Web Services credentials (placeholder for future use)."""

    provider: Literal["aws"] = "aws"

    access_key_id: str = Field(..., description="AWS access key ID")
    secret_access_key: SecretStr = Field(..., description="AWS secret access key")
    region: str = Field(default="us-east-1", description="AWS region")


# Discriminated union — the ``provider`` field selects the variant.
Credentials = Annotated[
    AzureCredentials | GCPCredentials | AWSCredentials,
    Field(discriminator="provider"),
]
