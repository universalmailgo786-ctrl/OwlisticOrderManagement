#!/bin/bash
# Ultra-simple guided Apps Script redeploy (no special permissions needed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CODE="$ROOT/apps-script/Code.gs"
SHEET_URL="https://docs.google.com/spreadsheets/d/1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ/edit"
CHECK_URL="https://script.google.com/macros/s/AKfycbx-XBKX5WcoBIHgHss2uQ_RXRodMLoCO8qjBbDql32XO2RdfFSsBphKBUHgkf0SUdC7/exec?action=ensureScheduleColumns"
HELPER="$ROOT/scripts/deploy-helper.html"

pbcopy < "$CODE"
open "$HELPER"
open -a "Google Chrome" "$SHEET_URL"

osascript <<'EOF'
display dialog "Don't worry — I will walk you through this.

The updated script is already copied.

Your Google Sheet is opening now.

Click Start when you see the sheet." buttons {"Cancel", "Start"} default button "Start" with title "Owlistic — easy update"
EOF

osascript <<'EOF'
display dialog "STEP 1 — Open the script editor

At the top of the Google Sheet, click:

   Extensions

Then click:

   Apps Script

A new tab opens with code. Wait for it.

Then click Continue." buttons {"Cancel", "Continue"} default button "Continue" with title "Step 1 of 3"
EOF

osascript <<'EOF'
display dialog "STEP 2 — Paste the new code

1) Click once inside the big code box (the white/dark coding area)
2) Press these keys on your keyboard:
      Command + A     (selects all old code)
      Command + V     (pastes the new code)
      Command + S     (saves)

You should see a small “Saved” message.

Then click Continue." buttons {"Cancel", "Continue"} default button "Continue" with title "Step 2 of 3"
EOF

osascript <<'EOF'
display dialog "STEP 3 — Turn the new code on

1) Top right: click Deploy
2) Click Manage deployments
3) Click the pencil (edit) icon
4) Where it says Version, choose New version
5) Click Deploy
6) Click Done

This is the important step. When finished, click Finish." buttons {"Cancel", "Finish"} default button "Finish" with title "Step 3 of 3"
EOF

BODY="$(curl -sS -L "$CHECK_URL" || true)"
echo "$BODY" > /tmp/owlistic-deploy-check.json
echo "$BODY"

if echo "$BODY" | grep -q '"action":"ensureScheduleColumns"'; then
  osascript <<'EOF'
display dialog "It worked!

Now open Order Records and press:
   Command + Shift + R

The red warning should go away, and schedule columns will show in the sheet." buttons {"Done"} default button "Done" with title "Success"
EOF
  exit 0
fi

osascript <<'EOF'
display dialog "Not confirmed yet.

Most common miss: in Deploy → Manage deployments → pencil, you must choose Version → New version, then Deploy.

Do that, then click Try again." buttons {"Try again", "Close"} default button "Try again" with title "Check"
EOF
