const crypto = require("node:crypto");
const { promisify } = require("node:util");

const pbkdf2 = promisify(crypto.pbkdf2);
const ITERATIONS = 210_000;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2_sha256$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, iterationsText, saltText, expectedText] = String(encoded || "").split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2_sha256" || !Number.isInteger(iterations) || !saltText || !expectedText) return false;
  const expected = Buffer.from(expectedText, "base64");
  const actual = await pbkdf2(password, Buffer.from(saltText, "base64"), iterations, expected.length, "sha256");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
