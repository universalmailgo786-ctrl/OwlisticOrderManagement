(function (global) {
  const SESSION_KEY = "owlistic.session";
  const store = global.OwlisticStore;

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const session = raw ? JSON.parse(raw) : null;
      if (!session || !session.username || !session.role) return null;
      return session;
    } catch (err) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session || {}));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function isSuperAdmin(session) {
    const current = session || getSession();
    return Boolean(current && current.role === "superadmin");
  }

  function accountName(session) {
    const current = session || getSession();
    return current && current.account ? String(current.account).trim() : "";
  }

  function sameAccount(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  function belongsToAccount(orderOrName, account) {
    const wanted = String(account || "").trim().toLowerCase();
    const name = String(orderOrName || "").trim().toLowerCase();
    if (!wanted || !name) return false;
    if (name === wanted) return true;
    if (name.indexOf(wanted + " ") === 0) return true;
    if (wanted.indexOf(name + " ") === 0) return true;
    return false;
  }

  function loginUrl(username, password) {
    const base = (global.OwlisticSheet && global.OwlisticSheet.getWebAppUrl()) || "";
    const join = base.indexOf("?") >= 0 ? "&" : "?";
    return base + join +
      "action=login" +
      "&username=" + encodeURIComponent(username || "") +
      "&password=" + encodeURIComponent(password || "");
  }

  function parseBody(text) {
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

  function login(username, password) {
    const url = loginUrl(username, password);
    if (!url || url.indexOf("http") !== 0) {
      return Promise.resolve({ ok: false, error: "Google Sheet login is not connected." });
    }
    return fetch(url, { method: "GET", credentials: "omit" }).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseBody(text);
      if (!data) return { ok: false, error: "Could not read the login response. Deploy the latest Apps Script." };
      if (!data.ok) return data;
      const session = {
        username: data.username,
        role: data.role === "superadmin" ? "superadmin" : "user",
        account: data.account || "",
        name: data.personName || data.name || data.username,
        personName: data.personName || data.name || "",
        whatsapp: data.whatsapp || "",
        fiverrId: data.fiverrId || "",
        fiverrGigUrl: data.fiverrGigUrl || "",
        paymentStatus: data.paymentStatus || "",
        loggedInAt: new Date().toISOString()
      };
      setSession(session);
      ensureLocalAccount(session);
      fetchUserProfile().catch(function () {});
      return { ok: true, session: session };
    }).catch(function () {
      return { ok: false, error: "Could not reach the login sheet. Check the web app URL." };
    });
  }

  function logout() {
    clearSession();
    window.location.href = "login.html";
  }

  function nextPath() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.charAt(0) !== "/" && next.indexOf("://") === -1) return next;
    return "index.html";
  }

  function requirePage() {
    const session = getSession();
    if (session) return session;
    const here = (window.location.pathname.split("/").pop() || "index.html") + window.location.search;
    window.location.replace("login.html?next=" + encodeURIComponent(here));
    return null;
  }

  function profileFromSession(current) {
    return {
      name: accountName(current) || (current && current.username) || "",
      username: current && current.username ? current.username : "",
      personName: (current && (current.personName || current.name)) || "",
      whatsapp: (current && current.whatsapp) || "",
      fiverrId: (current && current.fiverrId) || "",
      fiverrGigUrl: (current && current.fiverrGigUrl) || "",
      paymentStatus: (current && current.paymentStatus) || ""
    };
  }

  function ensureLocalAccount(session) {
    const current = session || getSession();
    if (!current || isSuperAdmin(current) || !store) return null;
    const wanted = accountName(current);
    if (!wanted) return null;
    const accounts = store.getAccounts();
    let match = accounts.find(function (account) {
      return sameAccount(account.name, wanted) ||
        sameAccount(store.accountLabel(account), wanted) ||
        sameAccount(account.username, current.username);
    });
    const profile = profileFromSession(current);
    profile.name = wanted;
    if (match) {
      profile.id = match.id;
    }
    ["whatsapp", "personName", "fiverrId", "fiverrGigUrl", "paymentStatus", "username"].forEach(function (key) {
      const sessionValue = String((current && current[key]) || "").trim();
      const profileValue = String((profile && profile[key]) || "").trim();
      if (sessionValue) profile[key] = sessionValue;
      else if (!profileValue && match && match[key]) profile[key] = match[key];
    });
    if (!profile.personName && current.personName) profile.personName = current.personName;
    if (!profile.personName && current.name && !sameAccount(current.name, wanted)) {
      profile.personName = current.name;
    }
    return store.upsertAccount(profile);
  }

  function applyUserProfile(profile) {
    const current = getSession();
    if (!current || !profile) return current;
    if (profile.account) current.account = profile.account;
    if (profile.personName || profile.name) {
      current.personName = profile.personName || profile.name;
      current.name = profile.personName || profile.name;
    }
    if (profile.whatsapp) current.whatsapp = profile.whatsapp;
    if (profile.fiverrId) current.fiverrId = profile.fiverrId;
    if (profile.fiverrGigUrl) current.fiverrGigUrl = profile.fiverrGigUrl;
    if (profile.paymentStatus) current.paymentStatus = profile.paymentStatus;
    setSession(current);
    ensureLocalAccount(current);
    return current;
  }

  function fetchUserProfile() {
    const current = getSession();
    if (!current || !current.username) {
      return Promise.resolve({ skipped: true });
    }
    const base = (global.OwlisticSheet && global.OwlisticSheet.getWebAppUrl()) || "";
    if (!base || base.indexOf("http") !== 0) {
      return Promise.resolve({ skipped: true });
    }
    const join = base.indexOf("?") >= 0 ? "&" : "?";
    const url = base + join +
      "action=getUserProfile" +
      "&username=" + encodeURIComponent(current.username || "") +
      "&role=" + encodeURIComponent(current.role || "") +
      "&userAccount=" + encodeURIComponent(current.account || "") +
      "&_=" + Date.now();
    return fetch(url, { method: "GET", credentials: "omit", cache: "no-store" }).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseBody(text);
      if (data && data.ok) applyUserProfile(data);
      const sheet = global.OwlisticSheet;
      if (!sheet || typeof sheet.fetchAccountProfile !== "function") {
        return data || { ok: false };
      }
      return sheet.fetchAccountProfile(current.account || current.username).then(function (profile) {
        if (profile && profile.ok !== false) {
          applyUserProfile(profile);
          return profile;
        }
        if (!current.username || sameAccount(current.username, current.account)) {
          return profile || data || { ok: false };
        }
        return sheet.fetchAccountProfile(current.username).then(function (retry) {
          if (retry && retry.ok !== false) applyUserProfile(retry);
          return retry || profile || data || { ok: false };
        });
      });
    }).catch(function () {
      const sheet = global.OwlisticSheet;
      if (!sheet || typeof sheet.fetchAccountProfile !== "function") {
        return { ok: false };
      }
      return sheet.fetchAccountProfile(current.account || current.username).then(function (profile) {
        if (profile && profile.ok !== false) {
          applyUserProfile(profile);
          return profile;
        }
        if (!current.username || sameAccount(current.username, current.account)) {
          return profile || { ok: false };
        }
        return sheet.fetchAccountProfile(current.username).then(function (retry) {
          if (retry && retry.ok !== false) applyUserProfile(retry);
          return retry || profile || { ok: false };
        });
      });
    });
  }

  function canSeeOrder(order, session) {
    const current = session || getSession();
    if (!current) return false;
    if (isSuperAdmin(current)) return true;
    const wanted = accountName(current);
    if (sameAccount(order && order.accountName, wanted) || belongsToAccount(order && order.accountName, wanted)) return true;
    return visibleAccounts(current).some(function (account) {
      return (order && order.accountId && order.accountId === account.id) ||
        belongsToAccount(order && order.accountName, account.name) ||
        belongsToAccount(order && order.accountName, store.accountLabel(account));
    });
  }

  function visibleOrders(session) {
    if (!store) return [];
    return store.getOrders().filter(function (order) {
      return canSeeOrder(order, session);
    });
  }

  function visibleAccounts(session) {
    if (!store) return [];
    const current = session || getSession();
    const accounts = store.getAccounts();
    if (isSuperAdmin(current)) return accounts;
    const wanted = accountName(current);
    return accounts.filter(function (account) {
      return sameAccount(account.name, wanted) ||
        sameAccount(store.accountLabel(account), wanted) ||
        sameAccount(account.username, current.username);
    });
  }

  function bindNav() {
    const session = getSession();
    const who = document.getElementById("nav-who");
    const logoutBtn = document.getElementById("logout-btn");
    const box = document.getElementById("nav-user");
    if (!session) return;
    if (box) box.hidden = false;
    if (who) {
      who.textContent = isSuperAdmin(session)
        ? (session.name || session.username) + " · Super Admin"
        : (session.name || session.username) + " · " + (session.account || "Account");
    }
    if (logoutBtn) logoutBtn.addEventListener("click", logout);
    document.querySelectorAll(".admin-only").forEach(function (el) {
      if (el.id === "hanif-costing-panel") return;
      el.hidden = !isSuperAdmin(session);
    });
  }

  function sheetAuth(payload) {
    const session = getSession();
    if (!session) return payload;
    payload.role = session.role;
    payload.userAccount = session.account || "";
    payload.username = session.username || "";
    return payload;
  }

  global.OwlisticAuth = {
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    isSuperAdmin: isSuperAdmin,
    accountName: accountName,
    sameAccount: sameAccount,
    login: login,
    logout: logout,
    nextPath: nextPath,
    requirePage: requirePage,
    ensureLocalAccount: ensureLocalAccount,
    applyUserProfile: applyUserProfile,
    fetchUserProfile: fetchUserProfile,
    canSeeOrder: canSeeOrder,
    visibleOrders: visibleOrders,
    visibleAccounts: visibleAccounts,
    bindNav: bindNav,
    sheetAuth: sheetAuth
  };
})(window);
