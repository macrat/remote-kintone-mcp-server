import { CompactEncrypt, base64url, compactDecrypt } from "jose";

export interface Credentials {
	baseUrl: string;
	username: string;
	password: string;
	iat: number;
	exp: number;
}

let cachedKey: CryptoKey | null = null;

export async function getSecretKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;

	const envKey = process.env.JWE_SECRET_KEY;
	if (!envKey) {
		throw new Error("JWE_SECRET_KEY environment variable is not set");
	}

	const keyBytes = Buffer.from(envKey, "base64");
	if (keyBytes.length !== 32) {
		throw new Error("JWE_SECRET_KEY must be 32 bytes (256 bits)");
	}

	cachedKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
	return cachedKey;
}

export function resetKeyCache(): void {
	cachedKey = null;
}

export async function encrypt(payload: {
	baseUrl: string;
	username: string;
	password: string;
}): Promise<string> {
	const secretKey = await getSecretKey();
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + 24 * 60 * 60;

	const data: Credentials = {
		...payload,
		iat,
		exp,
	};

	const jwe = await new CompactEncrypt(
		new TextEncoder().encode(JSON.stringify(data)),
	)
		.setProtectedHeader({ alg: "dir", enc: "A256GCM" })
		.encrypt(secretKey);

	return jwe;
}

export async function decrypt(jwe: string): Promise<Credentials> {
	const secretKey = await getSecretKey();
	const { plaintext } = await compactDecrypt(jwe, secretKey);
	const credentials: Credentials = JSON.parse(
		new TextDecoder().decode(plaintext),
	);

	const now = Math.floor(Date.now() / 1000);
	if (credentials.exp <= now) {
		throw new Error("Token has expired");
	}

	return credentials;
}
