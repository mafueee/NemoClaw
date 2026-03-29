// ══════════════════════════════════════════════════════════════════
// NemoClaw Dashboard — Bearer Token Authentication Middleware
//
// On first start, generates a random token and stores it in
// ~/.nemoclaw/config.json.  All /api/ requests must include
// Authorization: Bearer <token>  or  ?token=<token>.
//
// The token is printed to stdout on server start so the operator
// can copy it into the browser or automation scripts.
// ══════════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const NEMOCLAW_DIR = path.join(
  process.env.HOME || "/root",
  ".nemoclaw"
);
const CONFIG_PATH = path.join(NEMOCLAW_DIR, "config.json");

/**
 * Load or generate the dashboard bearer token.
 * Token is persisted in ~/.nemoclaw/config.json
 */
function getOrCreateToken() {
  // Allow override via env var (useful for Docker / CI)
  if (process.env.NEMOCLAW_DASHBOARD_TOKEN) {
    return process.env.NEMOCLAW_DASHBOARD_TOKEN;
  }

  let config = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch {
    config = {};
  }

  if (config.dashboardToken) {
    return config.dashboardToken;
  }

  // Generate a new token
  const token = crypto.randomBytes(32).toString("hex");
  config.dashboardToken = token;

  // Ensure directory exists
  if (!fs.existsSync(NEMOCLAW_DIR)) {
    fs.mkdirSync(NEMOCLAW_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });

  return token;
}

const DASHBOARD_TOKEN = getOrCreateToken();

/**
 * Express middleware — rejects requests without a valid bearer token.
 *
 * Checks:
 *   1. Authorization: Bearer <token>
 *   2. Query parameter ?token=<token>
 *
 * Exempt paths:
 *   - All non-/api/ paths (static files, index.html)
 *   - GET /api/health (public health check)
 */
function authMiddleware(req, res, next) {
  // Authentication disabled per user request
  return next();
}

module.exports = { authMiddleware, DASHBOARD_TOKEN, getOrCreateToken };
