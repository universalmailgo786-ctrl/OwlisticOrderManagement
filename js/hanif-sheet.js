(function (global) {
  const pricing = global.OwlisticHanifPricing;

  function getWebAppUrl() {
    return (global.OwlisticSheet && global.OwlisticSheet.getWebAppUrl && global.OwlisticSheet.getWebAppUrl()) || "";
  }

  function authParams() {
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    return {
      role: (session && session.role) || "",
      userAccount: (session && session.account) || "",
      username: (session && session.username) || ""
    };
  }

  function parseJson(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try { return JSON.parse(match[0]); } catch (err2) { return null; }
    }
  }

  function fetchJson(url, options, timeoutMs) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeoutMs || 30000);
    const opts = Object.assign({ method: "GET", credentials: "omit", cache: "no-store" }, options || {});
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (response) {
      clearTimeout(timer);
      return response.text();
    }, function (err) {
      clearTimeout(timer);
      throw err;
    }).then(parseJson);
  }

  function postPayload(payload, timeoutMs) {
    const base = getWebAppUrl();
    if (!base) return Promise.resolve({ ok: false, error: "Google Sheet is not connected." });
    const auth = authParams();
    payload.role = auth.role;
    payload.userAccount = auth.userAccount;
    payload.username = auth.username;
    return fetch(base, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function () {
      return { ok: true };
    }).catch(function () {
      return { ok: false, error: "Could not reach Google Sheet." };
    });
  }

  function getUrl(action, extra) {
    const base = getWebAppUrl();
    if (!base) return "";
    const auth = authParams();
    const params = Object.assign({}, auth, extra || {}, { action: action, _: Date.now() });
    const query = Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(params[key] == null ? "" : params[key]);
    }).join("&");
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + query;
  }

  function listRecords() {
    const url = getUrl("listHanifRecords");
    if (!url) return Promise.resolve({ ok: false, records: [], error: "Google Sheet is not connected." });
    return fetchJson(url).then(function (data) {
      if (!data || !data.ok) return { ok: false, records: [], error: (data && data.error) || "Could not load Hanif records." };
      return { ok: true, records: data.records || [] };
    }).catch(function () {
      return { ok: false, records: [], error: "Could not reach Google Sheet." };
    });
  }

  function reconcileRecords() {
    const url = getUrl("reconcileHanifRecords");
    if (!url) return Promise.resolve({ ok: false, error: "Google Sheet is not connected." });
    return fetchJson(url, null, 120000);
  }

  function syncRecords(orders) {
    return postPayload({ action: "syncHanifRecords", orders: orders || [] }, 120000);
  }

  function updatePayment(record) {
    return postPayload({
      action: "updateHanifPayment",
      orderId: record.orderId,
      hanifPaymentStatus: record.hanifPaymentStatus,
      paidAmount: record.paidAmount,
      paidAt: record.paidAt || ""
    });
  }

  function bulkUpdatePayment(orderIds, status) {
    return postPayload({
      action: "bulkUpdateHanifPayment",
      orderIds: orderIds || [],
      hanifPaymentStatus: status
    });
  }

  function deleteRecord(orderId) {
    return postPayload({ action: "deleteHanifRecord", orderId: orderId });
  }

  function recordFromOrder(order, existing) {
    if (!pricing || !order || !order.id) return null;
    const prev = existing || {};
    const financials = pricing.buildFinancials(order.orderValue, prev.pkrRate);
    const paymentStatus = pricing.normalizeHanifPaymentStatus(prev.hanifPaymentStatus);
    const paidAmount = paymentStatus === "paid"
      ? pricing.parseMoney(prev.paidAmount || financials.hanifCost)
      : 0;
    const store = global.OwlisticStore;
    const orderStatus = (store && store.boardStatusLabel && store.boardStatusOf)
      ? store.boardStatusLabel(store.boardStatusOf(order))
      : (order.overallStatus || "In Progress");
    return {
      orderId: order.id,
      createdDate: order.createdAt || prev.createdDate || "",
      orderNumber: pricing.orderNumberFromId(order.id),
      account: [order.accountName || order.tabName, order.fiverrId].filter(Boolean).join(" \u00B7 "),
      fiverrId: order.fiverrId || "",
      clientName: order.clientName || "",
      businessName: order.businessName || "",
      orderValue: financials.orderValue,
      hanifCost: financials.hanifCost,
      fiverrFee: financials.fiverrFee,
      returnAfterFee: financials.returnAfterFee,
      totalLoss: financials.totalLoss,
      pkrRate: financials.pkrRate,
      totalLossPkr: financials.totalLossPkr,
      orderStatus: orderStatus,
      hanifPaymentStatus: paymentStatus,
      paidAmount: paidAmount,
      paidAt: paymentStatus === "paid" ? (prev.paidAt || "") : "",
      updatedAt: prev.updatedAt || ""
    };
  }

  function costChangedAfterPaid(record) {
    if (!record) return false;
    if (pricing.normalizeHanifPaymentStatus(record.hanifPaymentStatus) !== "paid") return false;
    const paid = pricing.parseMoney(record.paidAmount);
    const cost = pricing.parseMoney(record.hanifCost);
    return paid > 0 && cost > 0 && paid !== cost;
  }

  global.OwlisticHanifSheet = {
    listRecords: listRecords,
    syncRecords: syncRecords,
    reconcileRecords: reconcileRecords,
    updatePayment: updatePayment,
    bulkUpdatePayment: bulkUpdatePayment,
    deleteRecord: deleteRecord,
    recordFromOrder: recordFromOrder,
    costChangedAfterPaid: costChangedAfterPaid
  };
})(window);
