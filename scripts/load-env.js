const fs = require("fs");
const path = require("path");

function loadEnvFiles() {
  [".env.local", ".env"].forEach(function (name) {
    const file = path.join(__dirname, "..", name);
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === "#") return;
      const eq = trimmed.indexOf("=");
      if (eq < 1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.charAt(0) === '"' && val.slice(-1) === '"') || (val.charAt(0) === "'" && val.slice(-1) === "'")) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    });
  });
}

module.exports = loadEnvFiles;
