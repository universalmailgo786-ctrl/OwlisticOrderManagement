const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwlWvSU1b8SJ42_3xdrrl1w7GhUiezAjBN85w9MvD-uFc-jg8m6OGJdGJRLm-fLIdl2/exec";

const HANIF_PRICE_MAP = [
  [10, 20], [15, 26], [20, 32], [25, 38], [30, 44], [35, 51], [40, 58], [45, 65], [50, 70],
  [55, 78], [60, 84], [65, 90], [70, 98], [75, 105], [80, 110], [85, 115], [90, 120], [95, 125],
  [100, 132], [105, 138], [110, 144], [115, 151], [120, 157], [125, 164], [130, 170], [135, 176],
  [140, 183], [145, 189], [150, 196], [155, 202], [160, 208], [165, 215], [170, 221], [175, 228],
  [180, 234], [185, 240], [190, 247], [195, 252], [200, 258], [205, 264], [210, 271], [215, 277],
  [220, 283], [225, 290], [230, 296], [235, 302], [240, 309], [245, 316], [250, 320], [255, 326],
  [260, 333], [265, 339], [270, 346], [275, 352], [280, 358], [285, 365], [290, 371], [295, 378],
  [300, 384], [350, 448], [400, 512], [500, 640]
];

function parseMoney(value) {
  const num = Number(String(value || "").replace(/[^0-9.\-]/g, ""));
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function hanifCostForValue(orderValue) {
  const val = Math.round(parseMoney(orderValue));
  if (!val || val < 10) return 0;
  let match = null;
  for (let i = 0; i < HANIF_PRICE_MAP.length; i += 1) {
    if (HANIF_PRICE_MAP[i][0] <= val) match = HANIF_PRICE_MAP[i];
    else break;
  }
  return match ? match[1] : 0;
}

function buildFinancials(orderValue) {
  const value = parseMoney(orderValue);
  const hanifCost = hanifCostForValue(value);
  const fiverrFee = Math.round(value * 0.2 * 100) / 100;
  const returnAfterFee = Math.round((value - fiverrFee) * 100) / 100;
  const totalLoss = Math.round((hanifCost - returnAfterFee) * 100) / 100;
  const pkrRate = 275;
  return { orderValue: value, hanifCost, fiverrFee, returnAfterFee, totalLoss, pkrRate, totalLossPkr: Math.round(totalLoss * pkrRate) };
}

function orderNumberFromId(orderId) {
  const match = String(orderId || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function recordFromOrder(order) {
  const financials = buildFinancials(order.orderValue);
  if (!financials.orderValue) return null;
  return {
    orderId: order.id,
    createdDate: order.createdAt || "",
    orderNumber: orderNumberFromId(order.id),
    account: [order.accountName || order.tabName, order.fiverrId].filter(Boolean).join(" · "),
    clientName: order.clientName || "",
    businessName: order.businessName || "",
    orderValue: financials.orderValue,
    hanifCost: financials.hanifCost,
    fiverrFee: financials.fiverrFee,
    returnAfterFee: financials.returnAfterFee,
    totalLoss: financials.totalLoss,
    pkrRate: financials.pkrRate,
    totalLossPkr: financials.totalLossPkr,
    orderStatus: order.overallStatus || "In Progress"
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  return JSON.parse(text);
}

async function main() {
  const setup = await fetchJson(`${WEB_APP_URL}?action=setupHanifSheet&role=superadmin`);
  console.log("setupHanifSheet:", setup);

  const accounts = await fetchJson(`${WEB_APP_URL}?action=listAccounts&role=superadmin`);
  const tabs = [...new Set((accounts.accounts || []).map((a) => a.account).filter(Boolean))];
  const ordersData = await fetchJson(
    `${WEB_APP_URL}?action=listOrders&role=superadmin&tabs=${encodeURIComponent(tabs.join(","))}`
  );
  const orders = (ordersData.orders || []).map(recordFromOrder).filter(Boolean);
  console.log("orders to sync:", orders.length, orders.map((o) => o.orderId).join(", "));

  const sync = await fetchJson(WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "syncHanifRecords", role: "superadmin", orders })
  });
  console.log("syncHanifRecords:", sync);

  const list = await fetchJson(`${WEB_APP_URL}?action=listHanifRecords&role=superadmin`);
  console.log("listHanifRecords:", list.count, "records");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
