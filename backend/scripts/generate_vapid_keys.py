"""Generate VAPID key pair for Web Push (compatible with pywebpush).

Usage (from backend folder, with cryptography installed):
  python scripts/generate_vapid_keys.py

Paste into Render / .env — never commit the private key.
"""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def main() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    priv_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
    pub_raw = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    print("PUSH_ENABLED=true")
    print("VAPID_PUBLIC_KEY=" + b64url(pub_raw))
    print("VAPID_PRIVATE_KEY=" + b64url(priv_raw))
    print("VAPID_SUBJECT=mailto:adminvatask@vietanhschool.edu.vn")
    print()
    print("Copy các dòng trên vào Environment của backend rồi redeploy.")


if __name__ == "__main__":
    main()
