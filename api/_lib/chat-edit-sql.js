const fs = require("fs");
const path = require("path");

module.exports = fs.readFileSync(
  path.join(__dirname, "../../supabase/migrations/20260907020000_chat_edit_attachments.sql"),
  "utf8"
);
