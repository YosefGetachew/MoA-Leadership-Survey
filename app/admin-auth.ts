import { cookies } from "next/headers";

export const ADMIN_COOKIE = "training_pulse_admin";
export type StaffRole = "admin" | "data_encoder";
export type StaffSession = {
  username: string;
  displayName: string;
  role: StaffRole;
  expiresAt: number;
};

function encode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function createStaffSession(input: Omit<StaffSession, "expiresAt">) {
  const secret = process.env.MINISTRY_ADMIN_SESSION;
  if (!secret) throw new Error("Staff session secret is not configured.");
  const session: StaffSession = { ...input, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
  const payload = encode(JSON.stringify(session));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function getStaffSession() {
  const secret = process.env.MINISTRY_ADMIN_SESSION;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!secret || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || await sign(payload, secret) !== signature) return null;
  try {
    const session = JSON.parse(decode(payload)) as StaffSession;
    if (session.expiresAt <= Date.now() || !["admin", "data_encoder"].includes(session.role)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function isStaffAuthorized() {
  return Boolean(await getStaffSession());
}
