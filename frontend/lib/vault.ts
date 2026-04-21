"""Client-side encrypted credential vault.

The server stores only opaque encrypted blobs. The encryption key is
derived from the user's password using PBKDF2 and never leaves the browser.

Algorithm:
  - PBKDF2 (SHA-256, 100k iterations) to derive a 256-bit key from password + salt
  - AES-256-GCM for encryption
  - salt + iv + ciphertext stored as a single base64 string
"""

const ITERATIONS = 100_000;
const SALT_LEN = 16;
const IV_LEN = 12;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plaintext string (e.g. JSON-serialized credentials).
 * Returns a base64-encoded string containing salt + iv + ciphertext + authTag.
 */
export async function vaultEncrypt(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  // Concatenate salt + iv + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a vault blob. Returns the original plaintext string.
 */
export async function vaultDecrypt(blob: string, password: string): Promise<string> {
  const combined = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));

  const salt = combined.slice(0, SALT_LEN);
  const iv = combined.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = combined.slice(SALT_LEN + IV_LEN);

  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/** Store encrypted credentials in the server vault. */
export async function storeVault(encryptedBlob: string): Promise<void> {
  const token = localStorage.getItem("privateai_token");
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/vault/store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ encrypted_blob: encryptedBlob }),
  });
  if (!res.ok) throw new Error("Failed to store vault");
}

/** Retrieve encrypted credentials from the server vault. */
export async function retrieveVault(): Promise<string> {
  const token = localStorage.getItem("privateai_token");
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/vault/retrieve`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to retrieve vault");
  const data = await res.json();
  return data.encrypted_blob;
}
