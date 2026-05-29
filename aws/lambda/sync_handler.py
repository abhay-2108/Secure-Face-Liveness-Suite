"""
aws_sync_lambda.py — NHAI Edge AI Cloud Sync Lambda
=====================================================
AWS Lambda function that receives batched offline attendance events
from field devices, verifies Ed25519 cryptographic signatures, stores
records in DynamoDB, and returns a signed purge token.

Deployment:
    Package this file with its dependencies and deploy to AWS Lambda.
    Configure API Gateway as a trigger with POST method.

Environment Variables Required:
    DYNAMODB_TABLE_NAME  — Name of the DynamoDB attendance table
    SERVER_PRIVATE_KEY   — Hex-encoded Ed25519 private key for signing purge tokens
"""

import json
import os
import hashlib
import hmac
import time
import uuid
import base64
from typing import Any


# ──────────────────────────────────────────────────────────────────────────────
# DynamoDB Client (lazy-loaded)
# ──────────────────────────────────────────────────────────────────────────────
_dynamo_client = None
_dynamo_table = None


def _get_dynamodb_table():
    """Lazily initialize the DynamoDB table resource."""
    global _dynamo_client, _dynamo_table
    if _dynamo_table is None:
        import boto3
        _dynamo_client = boto3.resource("dynamodb")
        table_name = os.environ.get("DYNAMODB_TABLE_NAME", "nhai_attendance_events")
        _dynamo_table = _dynamo_client.Table(table_name)
    return _dynamo_table


# ──────────────────────────────────────────────────────────────────────────────
# Ed25519 Signature Verification
# ──────────────────────────────────────────────────────────────────────────────

def verify_ed25519_signature(message_bytes: bytes, signature_bytes: bytes, public_key_bytes: bytes) -> bool:
    """
    Verify an Ed25519 signature against a message using the device's public key.
    
    Uses the `cryptography` library which is available in AWS Lambda's Python 3.12 runtime.
    
    Args:
        message_bytes: The raw message bytes that were signed
        signature_bytes: The 64-byte Ed25519 signature
        public_key_bytes: The 32-byte Ed25519 public key
    
    Returns:
        True if the signature is valid, False otherwise
    """
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        public_key = Ed25519PublicKey.from_public_bytes(public_key_bytes)
        public_key.verify(signature_bytes, message_bytes)
        return True
    except Exception:
        return False


def sign_purge_token(record_ids: list[str]) -> str:
    """
    Generate a cryptographic purge authorization token.
    
    The server signs the concatenation of all successfully stored record IDs
    with its private Ed25519 key. The device verifies this before deleting
    local data, ensuring only the legitimate server can authorize purges.
    
    Args:
        record_ids: List of UUID strings that were successfully stored
    
    Returns:
        Hex-encoded Ed25519 signature string
    """
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        
        server_key_hex = os.environ.get("SERVER_PRIVATE_KEY", "")
        if not server_key_hex:
            # Fallback: generate a deterministic key for demo/hackathon purposes
            import hashlib
            seed = hashlib.sha256(b"nhai-hackathon-demo-key").digest()
            private_key = Ed25519PrivateKey.from_private_bytes(seed)
        else:
            private_key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(server_key_hex))
        
        # Concatenate all record IDs and sign
        concat_ids = "".join(record_ids)
        message = concat_ids.encode("utf-8")
        signature = private_key.sign(message)
        return signature.hex()
    except Exception as e:
        print(f"[PURGE TOKEN ERROR] Failed to sign purge token: {e}")
        return ""


# ──────────────────────────────────────────────────────────────────────────────
# CRDT Idempotency Check
# ──────────────────────────────────────────────────────────────────────────────

def is_duplicate_event(table, event_uuid: str) -> bool:
    """
    Check if an event UUID already exists in DynamoDB.
    
    This implements CRDT-style idempotency: if the device retries a failed
    upload, the Lambda detects the duplicate UUID and safely skips it.
    
    Args:
        table: DynamoDB Table resource
        event_uuid: The unique event identifier
    
    Returns:
        True if the event already exists (duplicate), False otherwise
    """
    try:
        response = table.get_item(Key={"event_id": event_uuid})
        return "Item" in response
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Lambda Handler
# ──────────────────────────────────────────────────────────────────────────────

def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    AWS Lambda entry point for processing batched attendance sync requests.
    
    Expected POST body (JSON):
    {
        "device_id": "device-uuid-string",
        "device_public_key": "hex-encoded-ed25519-public-key",
        "batch": [
            {
                "event_id": "uuid-string",
                "user_id": "worker-id",
                "timestamp": 1717000000,
                "latitude": 28.6139,
                "longitude": 77.2090,
                "embedding_hash": "sha256-hex-of-embedding",
                "encrypted_payload": "base64-encoded-chacha20-encrypted-data",
                "signature": "hex-encoded-ed25519-signature"
            },
            ...
        ]
    }
    
    Returns:
        200 OK with purge_token if all events are verified and stored
        400 Bad Request if signature verification fails
        500 Internal Server Error on unexpected failures
    """
    try:
        # Parse request body
        if isinstance(event.get("body"), str):
            body = json.loads(event["body"])
        else:
            body = event.get("body", event)
        
        device_id = body.get("device_id", "unknown")
        device_public_key_hex = body.get("device_public_key", "")
        batch = body.get("batch", [])
        
        if not batch:
            return _response(400, {"error": "Empty batch payload"})
        
        if not device_public_key_hex:
            return _response(400, {"error": "Missing device_public_key"})
        
        try:
            device_public_key = bytes.fromhex(device_public_key_hex)
        except ValueError:
            return _response(400, {"error": "Invalid device_public_key hex encoding"})
        
        print(f"[SYNC] Received batch of {len(batch)} events from device {device_id}")
        
        table = _get_dynamodb_table()
        stored_ids = []
        skipped_ids = []
        rejected_ids = []
        
        for record in batch:
            event_id = record.get("event_id", "")
            
            # ── CRDT Idempotency Check ──
            if is_duplicate_event(table, event_id):
                print(f"[CRDT] Duplicate event {event_id} — skipping (idempotent)")
                skipped_ids.append(event_id)
                stored_ids.append(event_id)  # Still include in purge token
                continue
            
            # ── Ed25519 Signature Verification ──
            signature_hex = record.get("signature", "")
            if not signature_hex:
                print(f"[REJECT] Event {event_id} — missing signature")
                rejected_ids.append(event_id)
                continue
            
            # Reconstruct the signed message: event_id + user_id + timestamp
            signed_message = (
                f"{record.get('event_id', '')}"
                f"{record.get('user_id', '')}"
                f"{record.get('timestamp', '')}"
            ).encode("utf-8")
            
            try:
                signature_bytes = bytes.fromhex(signature_hex)
            except ValueError:
                print(f"[REJECT] Event {event_id} — invalid signature hex")
                rejected_ids.append(event_id)
                continue
            
            if not verify_ed25519_signature(signed_message, signature_bytes, device_public_key):
                print(f"[REJECT] Event {event_id} — signature verification FAILED")
                rejected_ids.append(event_id)
                continue
            
            # ── Store in DynamoDB ──
            try:
                table.put_item(Item={
                    "event_id": event_id,
                    "device_id": device_id,
                    "user_id": record.get("user_id", ""),
                    "timestamp": int(record.get("timestamp", 0)),
                    "latitude": str(record.get("latitude", 0.0)),
                    "longitude": str(record.get("longitude", 0.0)),
                    "embedding_hash": record.get("embedding_hash", ""),
                    "encrypted_payload": record.get("encrypted_payload", ""),
                    "received_at": int(time.time()),
                    "sync_source": "lambda_v1"
                })
                stored_ids.append(event_id)
                print(f"[STORED] Event {event_id} for user {record.get('user_id', 'unknown')}")
            except Exception as e:
                print(f"[DB ERROR] Failed to store event {event_id}: {e}")
                rejected_ids.append(event_id)
        
        # ── Generate Cryptographic Purge Token ──
        if rejected_ids:
            print(f"[WARNING] {len(rejected_ids)} events rejected due to signature failures")
        
        if stored_ids:
            purge_token = sign_purge_token(stored_ids)
            
            return _response(200, {
                "status": "sync_complete",
                "stored_count": len(stored_ids),
                "skipped_duplicates": len(skipped_ids),
                "rejected_count": len(rejected_ids),
                "stored_ids": stored_ids,
                "rejected_ids": rejected_ids,
                "purge_token": purge_token
            })
        else:
            return _response(400, {
                "status": "sync_failed",
                "error": "All events were rejected due to signature verification failures",
                "rejected_count": len(rejected_ids),
                "rejected_ids": rejected_ids
            })
    
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON in request body"})
    except Exception as e:
        print(f"[FATAL] Lambda execution error: {e}")
        return _response(500, {"error": f"Internal server error: {str(e)}"})


def _response(status_code: int, body: dict) -> dict:
    """Helper to format an API Gateway-compatible Lambda response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body)
    }
