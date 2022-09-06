import crypto from "crypto";

export function ripemd160(data: Buffer): Buffer {
    return crypto.createHash("ripemd160").update(data).digest();
}
