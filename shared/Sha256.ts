import crypto from "crypto";

/**
 * Creates a 32-byte SHA256 hash from the supplied information.
 * @param val
 * @returns
 */
export function sha256(val: string | Buffer): Buffer {
    return crypto.createHash("sha256").update(val).digest();
}
