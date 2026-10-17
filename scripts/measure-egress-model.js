/**
 * Modeled Supabase application egress for order sync + chat.
 *
 * Calibrated so the "before" scenario matches the observed ~12.95 GB/month
 * dashboard figure under the assumptions below. After figures are projections
 * using the same assumptions — not confirmed production savings.
 *
 * Usage: node scripts/measure-egress-model.js
 */

function gb(bytes) {
  return bytes / (1024 * 1024 * 1024);
}

function mb(bytes) {
  return bytes / (1024 * 1024);
}

function fmtGb(bytes) {
  return gb(bytes).toFixed(2) + " GB";
}

function fmtMb(bytes) {
  return mb(bytes).toFixed(1) + " MB";
}

// Usage assumptions (representative, not exact)
const ASSUMPTIONS = {
  observedMonthlyGb: 12.95, // Supabase dashboard egress at diagnosis time
  activeBrowsers: 3,
  hoursPerDay: 9,
  daysPerMonth: 26,
  orderCount: 70,
  avgFullOrderBytes: 14 * 1024,
  digestRowBytes: 160,
  // Share of digest polls that actually fetch changed order payloads
  dirtyDigestShare: 0.22,
  avgChangedOrdersWhenDirty: 1.2,
  chatClients: 2.5,
  chatPollBytes: 5 * 1024,
  chatMessagePageBytes: 20 * 1024
};

function hoursMonth() {
  return ASSUMPTIONS.hoursPerDay * ASSUMPTIONS.daysPerMonth;
}

function beforeRaw() {
  const digestsPerHour = (3600 / 8) * ASSUMPTIONS.activeBrowsers;
  const fullPerHour = (3600 / 32) * ASSUMPTIONS.activeBrowsers;
  const digestBytes = digestsPerHour * ASSUMPTIONS.orderCount * ASSUMPTIONS.digestRowBytes;
  const fullBytes = fullPerHour * ASSUMPTIONS.orderCount * ASSUMPTIONS.avgFullOrderBytes;
  const chatPollsPerHour = (3600 / 15) * ASSUMPTIONS.chatClients;
  const chatBytes = chatPollsPerHour * ASSUMPTIONS.chatPollBytes +
    chatPollsPerHour * 0.3 * ASSUMPTIONS.chatMessagePageBytes;
  return {
    digestsPerHour: digestsPerHour,
    fullPerHour: fullPerHour,
    chatPollsPerHour: chatPollsPerHour,
    digestBytesHour: digestBytes,
    fullBytesHour: fullBytes,
    chatBytesHour: chatBytes,
    totalHour: digestBytes + fullBytes + chatBytes
  };
}

function afterRaw() {
  const digestsPerHour = (3600 / 25) * ASSUMPTIONS.activeBrowsers;
  const fullPerHour = (3600 / 300) * ASSUMPTIONS.activeBrowsers;
  const dirtyDigests = digestsPerHour * ASSUMPTIONS.dirtyDigestShare;
  const digestBytes = digestsPerHour * ASSUMPTIONS.orderCount * ASSUMPTIONS.digestRowBytes;
  const fullBytes = fullPerHour * ASSUMPTIONS.orderCount * ASSUMPTIONS.avgFullOrderBytes;
  const byIdsBytes = dirtyDigests * ASSUMPTIONS.avgChangedOrdersWhenDirty * ASSUMPTIONS.avgFullOrderBytes;
  const healthyShare = 0.75;
  const chatInterval = healthyShare * 180 + (1 - healthyShare) * 20;
  const chatPollsPerHour = (3600 / chatInterval) * ASSUMPTIONS.chatClients;
  const chatBytes = chatPollsPerHour * ASSUMPTIONS.chatPollBytes +
    chatPollsPerHour * 0.12 * ASSUMPTIONS.chatMessagePageBytes;
  return {
    digestsPerHour: digestsPerHour,
    fullPerHour: fullPerHour,
    dirtyDigestsPerHour: dirtyDigests,
    chatPollsPerHour: chatPollsPerHour,
    digestBytesHour: digestBytes,
    fullBytesHour: fullBytes,
    byIdsBytesHour: byIdsBytes,
    chatBytesHour: chatBytes,
    totalHour: digestBytes + fullBytes + byIdsBytes + chatBytes
  };
}

const before = beforeRaw();
const after = afterRaw();
const hours = hoursMonth();
const beforeMonthRaw = before.totalHour * hours;
const afterMonthRaw = after.totalHour * hours;
const observed = ASSUMPTIONS.observedMonthlyGb * 1024 * 1024 * 1024;
// Scale so "before" matches observed dashboard egress; apply same scale to after.
const scale = beforeMonthRaw > 0 ? observed / beforeMonthRaw : 1;
const beforeMonth = beforeMonthRaw * scale;
const afterMonth = afterMonthRaw * scale;
const reduction = beforeMonth > 0 ? (1 - afterMonth / beforeMonth) * 100 : 0;

const report = {
  assumptions: ASSUMPTIONS,
  note: [
    "Calibrated: modeled before is scaled to the observed 12.95 GB monthly Supabase egress.",
    "After is the same model with optimized intervals/payloads, using that same scale factor.",
    "Excludes Vercel static/HTML bandwidth, Google Drive transfers, and most Realtime websocket frame bytes.",
    "Supabase Log Ingestion is separate from egress; fewer queries also reduce log volume.",
    "Confirm after production deploy via Supabase Dashboard → Usage."
  ].join(" "),
  requests: {
    before: {
      digestsPerHour: Math.round(before.digestsPerHour),
      fullOrderDownloadsPerHour: Math.round(before.fullPerHour),
      chatPollsPerHour: Math.round(before.chatPollsPerHour),
      dbReadsPerHourApprox: Math.round(before.digestsPerHour + before.fullPerHour + before.chatPollsPerHour)
    },
    after: {
      digestsPerHour: Math.round(after.digestsPerHour),
      fullOrderDownloadsPerHour: Math.round(after.fullPerHour),
      dirtyTargetedFetchesPerHour: Math.round(after.dirtyDigestsPerHour),
      chatPollsPerHour: Math.round(after.chatPollsPerHour),
      dbReadsPerHourApprox: Math.round(
        after.digestsPerHour + after.fullPerHour + after.dirtyDigestsPerHour + after.chatPollsPerHour
      )
    }
  },
  bytes: {
    beforeHourlyModeled: fmtMb(before.totalHour * scale),
    afterHourlyModeled: fmtMb(after.totalHour * scale),
    beforeMonthlyCalibrated: fmtGb(beforeMonth),
    afterMonthlyProjected: fmtGb(afterMonth),
    reductionPercent: Math.round(reduction),
    scaleFactorApplied: Number(scale.toFixed(4))
  },
  freePlanHeadroom: {
    egressAllowanceGb: 5,
    projectedAfterGb: Number(gb(afterMonth).toFixed(2)),
    underAllowance: gb(afterMonth) < 5
  }
};

console.log(JSON.stringify(report, null, 2));
console.log(
  "\nCalibrated projection:",
  report.bytes.beforeMonthlyCalibrated,
  "→",
  report.bytes.afterMonthlyProjected,
  "(" + report.bytes.reductionPercent + "% reduction)",
  report.freePlanHeadroom.underAllowance ? "— under 5 GB free egress" : "— still above 5 GB; review assumptions"
);
