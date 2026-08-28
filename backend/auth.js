const crypto = require("node:crypto");

const ADMIN_COOKIE = "moa_reform_admin";
const VALID_ROLES = new Set(["admin", "viewer"]);

function signature(payload) {
  const secret = process.env.MINISTRY_ADMIN_SESSION;
  if (!secret) throw new Error("Staff session secret is not configured.");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createStaffSession({ username, displayName, role }) {
  const session = {
    username,
    displayName,
    role,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function getStaffSession(req) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token || !process.env.MINISTRY_ADMIN_SESSION) return null;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (session.expiresAt <= Date.now() || !VALID_ROLES.has(session.role)) return null;
    return session;
  } catch {
    return null;
  }
}

function requireStaff(req, res, next) {
  const session = getStaffSession(req);
  if (!session) return res.status(401).json({ error: "Staff access required." });
  req.staff = session;
  next();
}

function requireAdministrator(req, res, next) {
  const session = getStaffSession(req);
  if (!session || session.role !== "admin") {
    return res.status(403).json({ error: "Administrator access required." });
  }
  req.staff = session;
  next();
}

module.exports = {
  ADMIN_COOKIE,
  createStaffSession,
  getStaffSession,
  requireStaff,
  requireAdministrator,
};
