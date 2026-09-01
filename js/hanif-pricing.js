(function (global) {
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

  const FIVERR_FEE_RATE = 0.2;
  const DEFAULT_PKR_RATE = 275;

  function roundMoney(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function parseMoney(value) {
    const text = String(value == null ? "" : value).replace(/[^0-9.\-]/g, "");
    const num = Number(text);
    return isNaN(num) ? 0 : roundMoney(num);
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

  function fiverrFeeForValue(orderValue) {
    return roundMoney(parseMoney(orderValue) * FIVERR_FEE_RATE);
  }

  function buildFinancials(orderValue, pkrRate) {
    const value = parseMoney(orderValue);
    const hanifCost = hanifCostForValue(value);
    const fiverrFee = fiverrFeeForValue(value);
    const returnAfterFee = roundMoney(value - fiverrFee);
    const totalLoss = roundMoney(hanifCost - returnAfterFee);
    const rate = Number(pkrRate) > 0 ? Number(pkrRate) : DEFAULT_PKR_RATE;
    return {
      orderValue: value,
      hanifCost: hanifCost,
      fiverrFee: fiverrFee,
      returnAfterFee: returnAfterFee,
      totalLoss: totalLoss,
      pkrRate: rate,
      totalLossPkr: Math.round(totalLoss * rate)
    };
  }

  function orderNumberFromId(orderId) {
    const match = String(orderId || "").match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function normalizeHanifPaymentStatus(value) {
    return String(value || "").trim().toLowerCase() === "paid" ? "paid" : "unpaid";
  }

  global.OwlisticHanifPricing = {
    HANIF_PRICE_MAP: HANIF_PRICE_MAP,
    FIVERR_FEE_RATE: FIVERR_FEE_RATE,
    DEFAULT_PKR_RATE: DEFAULT_PKR_RATE,
    roundMoney: roundMoney,
    parseMoney: parseMoney,
    hanifCostForValue: hanifCostForValue,
    fiverrFeeForValue: fiverrFeeForValue,
    buildFinancials: buildFinancials,
    orderNumberFromId: orderNumberFromId,
    normalizeHanifPaymentStatus: normalizeHanifPaymentStatus
  };
})(window);
