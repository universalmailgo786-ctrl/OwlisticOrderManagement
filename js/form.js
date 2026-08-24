(function () {
  const store = window.OwlisticStore;
  const auth = window.OwlisticAuth;
  const session = auth.requirePage();
  if (!session) return;
  auth.ensureLocalAccount(session);
  auth.bindNav();

  const form = document.getElementById("order-questionnaire");
  const page = document.getElementById("page");
  const toast = document.getElementById("toast");
  const banner = document.getElementById("status-banner");
  const editMeta = document.getElementById("edit-meta");
  const accountSelect = document.getElementById("account-select");
  const accountModal = document.getElementById("account-modal");
  const accountList = document.getElementById("account-list");
  const accountEditor = document.getElementById("account-editor");
  const priceModal = document.getElementById("price-modal");
  const drop = document.getElementById("upload-drop");
  const fileInput = document.getElementById("requirementFile");
  const fileName = document.getElementById("upload-filename");
  const requirementList = document.getElementById("requirement-file-list");
  const revisionsList = document.getElementById("revisions-list");
  const readyToggle = document.getElementById("ready-to-approve");
  const boardStatusSelect = document.getElementById("board-status");
  const submitBtn = document.getElementById("submit-form");
  const deleteOrderBtn = document.getElementById("delete-order-btn");

  let lastFocus = null;
  let requirementFiles = [];
  let revisions = [];
  let persistTimer = null;
  let isSubmitting = false;

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.hidden = true;
    }, 2400);
  }

  function selectedPayment(name) {
    const checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : "";
  }

  function setPayment(name, value) {
    const paid = document.querySelector('input[name="' + name + '"][value="paid"]');
    const unpaid = document.querySelector('input[name="' + name + '"][value="unpaid"]');
    if (paid) paid.checked = value === "paid";
    if (unpaid) unpaid.checked = value === "unpaid";
  }

  function updateStatusUI() {
    const status = store.computeStatus({
      revisions: revisions,
      readyToApprove: readyToggle.checked,
      boardStatus: boardStatusSelect ? boardStatusSelect.value : ""
    });
    page.classList.remove("has-revision", "is-ready");
    banner.hidden = true;
    banner.classList.remove("is-revision", "is-ready");

    if (status === "revision-pending" || status === "revision-pending") {
      page.classList.add("has-revision");
      banner.hidden = false;
      banner.classList.add("is-revision");
      document.getElementById("status-banner-title").textContent = "Revision Pending";
      document.getElementById("status-banner-text").textContent = "An active revision is pending for this order.";
    } else if (status === "ready-to-approve") {
      page.classList.add("is-ready");
      banner.hidden = false;
      banner.classList.add("is-ready");
      document.getElementById("status-banner-title").textContent = "Order is Ready to Approve";
      document.getElementById("status-banner-text").textContent = "This order is waiting for approval.";
    } else if (status === "completed") {
      page.classList.add("is-ready");
      banner.hidden = false;
      banner.classList.add("is-ready");
      document.getElementById("status-banner-title").textContent = "Order Completed";
      document.getElementById("status-banner-text").textContent = "This order is marked completed.";
    }

    const readyText = readyToggle.checked ? "Ready to Approve" : "Not Ready";
    document.getElementById("ready-helper").textContent = readyText;
    document.getElementById("ready-switch-text").textContent = readyText;
  }

  function maybePersist() {
    if (isSubmitting) return;
    if (!document.getElementById("order-id").value) return;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(function () {
      saveOrder(true).catch(function () {});
    }, 250);
  }

  function storedBlob(record) {
    return record && (record.blob || record.blob);
  }

  function openRequirementFile(file) {
    if (file && file.url) {
      window.open(file.url, "_blank", "noopener");
      return;
    }
    if (!file || !file.id) return;
    store.getFile(file.id).then(function (record) {
      const blob = storedBlob(record);
      if (!blob) return;
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    });
  }

  function downloadRequirementFile(file) {
    if (file && file.url) {
      const link = document.createElement("a");
      link.href = file.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.download = file.name || "file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    if (!file || !file.id) return;
    store.getFile(file.id).then(function (record) {
      const blob = storedBlob(record);
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = file.name || (record && record.name) || "file";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  }

  function renderFileList(target, files, onChange) {
    target.innerHTML = "";
    files.forEach(function (file, index) {
      const item = document.createElement("li");
      const info = document.createElement("span");
      info.textContent = file.name + (file.uploadedAt ? " · " + store.formatDateTime(file.uploadedAt) : "");
      const actions = document.createElement("span");

      if (file.id || file.url) {
        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.textContent = "Open";
        openBtn.addEventListener("click", function () {
          openRequirementFile(file);
        });
        actions.appendChild(openBtn);

        const downloadBtn = document.createElement("button");
        downloadBtn.type = "button";
        downloadBtn.textContent = "Download";
        downloadBtn.addEventListener("click", function () {
          downloadRequirementFile(file);
        });
        actions.appendChild(downloadBtn);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", function () {
        files.splice(index, 1);
        if (onChange) onChange();
      });
      actions.appendChild(removeBtn);
      item.appendChild(info);
      item.appendChild(actions);
      target.appendChild(item);
    });
  }

  function refreshRequirementFiles() {
    const extra = fileInput.files && fileInput.files.length
      ? Array.from(fileInput.files).map(function (file) { return file.name; }).join(", ")
      : "";
    fileName.textContent = extra;
    fileName.classList.toggle("is-visible", Boolean(extra));
    renderFileList(requirementList, requirementFiles, function () {
      refreshRequirementFiles();
      maybePersist();
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function findRevision(id) {
    return revisions.find(function (item) { return item.id === id; }) || null;
  }

  function findMessage(messageId) {
    for (let i = 0; i < revisions.length; i += 1) {
      const messages = revisions[i].messages || [];
      for (let j = 0; j < messages.length; j += 1) {
        if (messages[j].id === messageId) return messages[j];
      }
    }
    return null;
  }

  function canAddNextRevision() {
    if (typeof store.canAddRevision === "function") {
      return store.canAddRevision({ revisions: revisions });
    }
    return !revisions.length || revisions.every(function (item) { return item.completed; });
  }

  function visibleFormRevisions() {
    if (typeof store.visibleRevisions === "function") {
      return store.visibleRevisions({ revisions: revisions });
    }
    const list = [];
    let i;
    for (i = 0; i < revisions.length; i += 1) {
      list.push(revisions[i]);
      if (!revisions[i].completed) break;
    }
    return list;
  }

  function updateAddRevisionButton() {
    const button = document.getElementById("add-revision");
    if (!button) return;
    const allowed = canAddNextRevision();
    const nextNumber = revisions.length + 1;
    button.disabled = !allowed;
    button.textContent = "+ Add Revision " + nextNumber;
    button.title = allowed
      ? (revisions.length ? "Add revision " + nextNumber : "Add revision 1")
      : "Complete the current revision before adding the next one.";
  }

  function updateRevisionsCount() {
    const countEl = document.getElementById("revisions-count");
    if (!countEl) return;
    const count = revisions.length;
    const visible = visibleFormRevisions();
    if (!count) {
      countEl.textContent = "0 revisions";
      return;
    }
    if (visible.length < count) {
      countEl.textContent = "Showing revision " + visible.length + " of " + count;
      return;
    }
    countEl.textContent = count === 1 ? "1 revision" : count + " revisions";
  }

  function messageRole(message) {
    return message && (message.role === "seller" || message.kind === "seller") ? "seller" : "buyer";
  }

  function messageFilled(message) {
    if (!message) return false;
    return Boolean(String(message.text || "").trim() || (message.files && message.files.length));
  }

  function lastPair(revision) {
    const pairs = pairMessages((revision && revision.messages) || []);
    return pairs.length ? pairs[pairs.length - 1] : null;
  }

  function pairNumber(revision) {
    const pairs = pairMessages((revision && revision.messages) || []);
    return pairs.length || 1;
  }

  function pairFilled(pair) {
    return messageFilled(pair && pair.buyer) && messageFilled(pair && pair.seller);
  }

  function pruneEmptyExtras(revision) {
    const kept = [];
    let openBuyer = null;
    let hasSeller = false;
    (revision.messages || []).forEach(function (message) {
      const role = messageRole(message);
      const filled = messageFilled(message);
      if (role === "buyer") {
        if (openBuyer && !messageFilled(openBuyer) && !filled) return;
        if (openBuyer && !hasSeller) return;
        openBuyer = message;
        hasSeller = false;
        kept.push(message);
        return;
      }
      if (hasSeller && !filled) return;
      hasSeller = true;
      kept.push(message);
    });
    revision.messages = kept;
  }

  function canAddMessage(revision, role) {
    const last = lastPair(revision);
    if (role === "buyer") {
      if (!last) return true;
      if (!messageFilled(last.buyer)) return false;
      if (!messageFilled(last.seller)) return false;
      return true;
    }
    if (!last || !messageFilled(last.buyer)) return false;
    if (last.seller && !messageFilled(last.seller)) return false;
    return !last.seller;
  }

  function addHint(revision, role) {
    const last = lastPair(revision);
    if (role === "buyer") {
      if (last && !messageFilled(last.buyer)) return "Fill Buyer Message " + pairNumber(revision) + " before adding another";
      if (last && !messageFilled(last.seller)) return "Add Seller Message " + pairNumber(revision) + " first";
      return "Fill the current buyer message before adding another";
    }
    if (!last || !messageFilled(last.buyer)) return "Fill Buyer Message " + pairNumber(revision) + " first";
    if (last.seller && !messageFilled(last.seller)) return "Fill Seller Message " + pairNumber(revision) + " before adding another";
    if (pairFilled(last)) return "Add the next buyer message first";
    return "Fill the buyer message first";
  }

  function pairMessages(messages) {
    const pairs = [];
    let pendingBuyer = null;
    (messages || []).forEach(function (message) {
      if (messageRole(message) === "buyer") {
        if (pendingBuyer) pairs.push({ buyer: pendingBuyer, seller: null });
        pendingBuyer = message;
        return;
      }
      pairs.push({ buyer: pendingBuyer, seller: message });
      pendingBuyer = null;
    });
    if (pendingBuyer) pairs.push({ buyer: pendingBuyer, seller: null });
    return pairs;
  }

  function addMessage(revision, role) {
    revision.messages = revision.messages || [];
    revision.messages.push({
      id: store.uid("msg"),
      role: role,
      createdAt: store.nowIso(),
      text: "",
      files: []
    });
  }

  function bubbleHtml(revision, message, role, number) {
    const label = role === "seller" ? "Seller Message " + number : "Buyer Message " + number;
    const placeholder = role === "seller"
      ? "Write seller message " + number
      : "Write buyer message " + number;
    return '<div class="chat-bubble is-' + role + '" data-message-card="' + message.id + '">' +
      '<div class="chat-bubble-head">' +
        '<div class="chat-bubble-heading">' +
          '<span class="chat-pill">' + (role === "seller" ? "Seller" : "Buyer") + "</span>" +
          '<p class="chat-label">' + label + "</p>" +
        "</div>" +
        '<div class="chat-card-actions">' +
          '<button type="button" class="chat-card-btn is-edit" data-edit-message="' + message.id + '">Edit</button>' +
          '<button type="button" class="chat-card-btn is-delete" data-delete-message="' + message.id + '" data-revision-id="' + revision.id + '">Delete</button>' +
        "</div>" +
      "</div>" +
      '<p class="chat-time">' + store.formatDateTime(message.createdAt) + "</p>" +
      '<textarea data-message-text="' + message.id + '" placeholder="' + placeholder + '">' + escapeHtml(message.text || "") + "</textarea>" +
      '<label class="chat-attach">' +
        '<input type="file" multiple data-message-files="' + message.id + '" />' +
        "<span>Attach files</span>" +
      "</label>" +
      '<ul class="file-list" data-message-file-list="' + message.id + '"></ul>' +
    "</div>";
  }

  function emptySlotHtml(revision, role, number) {
    const canAdd = canAddMessage(revision, role);
    if (role === "seller") {
      return '<div class="chat-wait is-seller' + (canAdd ? " is-ready" : "") + '">' +
        '<span class="chat-pill">Seller</span>' +
        '<p class="chat-label">Seller Message ' + number + "</p>" +
        '<p class="chat-wait-copy" data-wait-copy>' + (canAdd ? "Buyer Message " + number + " is ready. Add Seller Message " + number + "." : "Fill Buyer Message " + number + " first.") + "</p>" +
        '<button type="button" class="row-action-btn" data-add-message="seller" data-revision-id="' + revision.id + '"' + (canAdd ? "" : " disabled") + ">" +
          "+ Add Seller Message " + number +
        "</button>" +
      "</div>";
    }
    return '<div class="chat-wait is-buyer">' +
      '<span class="chat-pill">Buyer</span>' +
      '<p class="chat-label">Buyer Message ' + number + "</p>" +
      '<p class="chat-wait-copy">This row starts with the buyer.</p>' +
    "</div>";
  }

  function slotHtml(revision, message, role, number) {
    return '<div class="chat-slot is-' + role + '">' +
      (message ? bubbleHtml(revision, message, role, number) : emptySlotHtml(revision, role, number)) +
    "</div>";
  }

  function removeMessage(revision, messageId) {
    const messages = revision.messages || [];
    const index = messages.findIndex(function (item) { return item.id === messageId; });
    if (index === -1) return;
    if (messageRole(messages[index]) === "buyer") {
      const removeCount = messages[index + 1] && messageRole(messages[index + 1]) === "seller" ? 2 : 1;
      messages.splice(index, removeCount);
    } else {
      messages.splice(index, 1);
    }
    if (!messages.length) addMessage(revision, "buyer");
  }

  function removePair(revision, pairIndex) {
    const pairs = pairMessages(revision.messages || []);
    const pair = pairs[pairIndex];
    if (!pair) return;
    const ids = {};
    if (pair.buyer) ids[pair.buyer.id] = true;
    if (pair.seller) ids[pair.seller.id] = true;
    revision.messages = (revision.messages || []).filter(function (item) { return !ids[item.id]; });
    if (!revision.messages.length) addMessage(revision, "buyer");
  }

  function removeRevision(revisionId) {
    revisions = revisions.filter(function (item) { return item.id !== revisionId; });
    revisions.forEach(function (item, index) {
      item.number = index + 1;
    });
  }

  function nextRowButtonHtml(revision, pairs) {
    const nextNumber = pairs.length + 1;
    const allowed = canAddMessage(revision, "buyer");
    return '<div class="chat-next">' +
      '<button type="button" class="next-row-btn" data-add-next-row data-revision-id="' + revision.id + '"' + (allowed ? "" : " disabled") + ' title="' + escapeHtml(allowed ? "Add Buyer Message " + nextNumber : addHint(revision, "buyer")) + '">' +
        "+ Add Buyer Message " + nextNumber +
      "</button>" +
      (allowed
        ? "<p>This starts row " + nextNumber + ": Buyer Message " + nextNumber + " on the left, Seller Message " + nextNumber + " on the right.</p>"
        : '<p data-next-hint>' + escapeHtml(addHint(revision, "buyer")) + "</p>") +
    "</div>";
  }

  function updateRevisionActionButtons() {
    revisionsList.querySelectorAll("[data-add-message]").forEach(function (button) {
      const revision = findRevision(button.getAttribute("data-revision-id"));
      const role = button.getAttribute("data-add-message");
      const allowed = Boolean(revision && canAddMessage(revision, role));
      button.disabled = !allowed;
      button.title = allowed ? "Add the next " + (role === "seller" ? "seller message" : "buyer message") : addHint(revision, role);
      const wait = button.closest(".chat-wait");
      if (wait) {
        wait.classList.toggle("is-ready", allowed);
        const copy = wait.querySelector("[data-wait-copy]");
        const last = revision && lastPair(revision);
        const number = last ? pairMessages(revision.messages).length : 1;
        if (copy && role === "seller") {
          copy.textContent = allowed
            ? "Buyer Message " + number + " is ready. Add Seller Message " + number + "."
            : "Fill Buyer Message " + number + " first.";
        }
      }
    });
    revisionsList.querySelectorAll("[data-add-next-row]").forEach(function (button) {
      const revision = findRevision(button.getAttribute("data-revision-id"));
      const allowed = Boolean(revision && canAddMessage(revision, "buyer"));
      const nextNumber = revision ? pairMessages(revision.messages || []).length + 1 : 1;
      button.disabled = !allowed;
      button.title = allowed ? "Add Buyer Message " + nextNumber : addHint(revision, "buyer");
      const hint = button.parentNode && button.parentNode.querySelector("p");
      if (hint) {
        hint.textContent = allowed
          ? "This starts row " + nextNumber + ": Buyer Message " + nextNumber + " on the left, Seller Message " + nextNumber + " on the right."
          : addHint(revision, "buyer");
      }
    });
  }

  function renderRevisions() {
    let pruned = false;
    revisions.forEach(function (revision) {
      const before = (revision.messages || []).length;
      pruneEmptyExtras(revision);
      if ((revision.messages || []).length !== before) pruned = true;
    });

    revisionsList.innerHTML = "";
    updateRevisionsCount();
    updateAddRevisionButton();
    if (!revisions.length) {
      revisionsList.innerHTML = '<p class="empty-state">No revisions yet. Add Revision 1 to start the buyer and seller conversation.</p>';
      return;
    }

    visibleFormRevisions().forEach(function (revision) {
      const round = document.createElement("article");
      round.className = "revision-round" + (revision.completed ? " is-complete" : "");
      round.setAttribute("data-revision-id", revision.id);

      const messages = revision.messages || [];
      const pairs = pairMessages(messages);
      const thread = pairs.length
        ? pairs.map(function (pair, index) {
          const number = index + 1;
          return '<div class="chat-pair" data-pair-index="' + index + '">' +
            '<div class="chat-step-col">' +
              '<span class="chat-step" aria-hidden="true">' + number + "</span>" +
              '<button type="button" class="chat-row-delete" data-delete-row="' + index + '" data-revision-id="' + revision.id + '" title="Delete row ' + number + '">Delete row</button>' +
            "</div>" +
            slotHtml(revision, pair.buyer, "buyer", number) +
            slotHtml(revision, pair.seller, "seller", number) +
          "</div>";
        }).join("")
        : '<p class="chat-empty">No comments in this revision yet.</p>';

      round.innerHTML =
        '<div class="revision-round-head">' +
          "<div>" +
            '<p class="revision-title">Revision ' + revision.number + "</p>" +
            '<p class="revision-meta">' + store.formatDateTime(revision.createdAt) + " · " + (pairs.length === 1 ? "1 row" : pairs.length + " rows") + "</p>" +
          "</div>" +
          '<div class="revision-round-actions">' +
            '<label class="revision-complete">' +
              '<input type="checkbox" data-complete-revision="' + revision.id + '"' + (revision.completed ? " checked" : "") + ">" +
              "<span>" + (revision.completed ? "Revision completed" : "Mark revision completed") + "</span>" +
            "</label>" +
            '<button type="button" class="ghost-btn is-danger" data-delete-revision="' + revision.id + '">Delete revision</button>' +
          "</div>" +
        "</div>" +
        '<div class="chat-thread">' +
          '<div class="chat-legend" aria-hidden="true">' +
            "<span></span><span>Buyer</span><span>Seller</span>" +
          "</div>" +
          thread +
          nextRowButtonHtml(revision, pairs) +
        "</div>";

      revisionsList.appendChild(round);
      messages.forEach(function (message) {
        const list = round.querySelector('[data-message-file-list="' + message.id + '"]');
        if (!list) return;
        renderFileList(list, message.files || [], function () {
          renderRevisions();
          maybePersist();
        });
      });
    });

    updateRevisionActionButtons();
    if (pruned) maybePersist();
  }

  function isAdmin() {
    return auth.isSuperAdmin();
  }

  function lockedAccount() {
    if (isAdmin()) return store.getAccount(accountSelect.value);
    return auth.visibleAccounts()[0] || store.getAccount(accountSelect.value);
  }

  function lockAccountUi() {
    if (isAdmin()) {
      accountSelect.disabled = false;
      return;
    }
    const match = auth.visibleAccounts()[0];
    if (match) accountSelect.value = match.id;
    accountSelect.disabled = true;
    const title = document.getElementById("select-account-title");
    if (title) title.textContent = "Your Account";
    const copy = document.querySelector(".account-panel-copy p");
    if (copy) copy.textContent = "You can fill the form and view records for this account only.";
  }

  function populateAccounts(selectedId) {
    const accounts = auth.visibleAccounts();
    const current = selectedId || accountSelect.value;
    accountSelect.innerHTML = isAdmin()
      ? '<option value="">Select an account</option>'
      : "";
    accounts.forEach(function (account) {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = store.accountLabel(account);
      accountSelect.appendChild(option);
    });
    if (current && accounts.some(function (account) { return account.id === current; })) {
      accountSelect.value = current;
    }
    lockAccountUi();
  }

  function applyAccount(account) {
    if (!account) return;
    document.getElementById("whatsapp").value = account.whatsapp || "";
    document.getElementById("name").value = account.personName || "";
    setPayment("paymentStatus", account.paymentStatus || "");
    document.getElementById("fiverrId").value = account.fiverrId || "";
    document.getElementById("fiverrGigUrl").value = account.fiverrGigUrl || "";
  }

  function fillAccountEditor(account) {
    document.getElementById("account-edit-id").value = account && account.id ? account.id : "";
    document.getElementById("account-name").value = account && account.name ? account.name : "";
    document.getElementById("account-whatsapp").value = account && account.whatsapp ? account.whatsapp : "";
    document.getElementById("account-person-name").value = account && account.personName ? account.personName : "";
    document.getElementById("account-fiverr-id").value = account && account.fiverrId ? account.fiverrId : "";
    document.getElementById("account-fiverr-url").value = account && account.fiverrGigUrl ? account.fiverrGigUrl : "";
    setPayment("accountPaymentStatus", account && account.paymentStatus ? account.paymentStatus : "");
  }

  function renderAccountList() {
    const accounts = store.getAccounts();
    const editingId = document.getElementById("account-edit-id").value;
    accountList.innerHTML = "";
    if (!accounts.length) {
      accountList.innerHTML = '<p class="empty-state">No accounts yet. Add one on the right.</p>';
      return;
    }
    accounts.forEach(function (account) {
      const item = document.createElement("div");
      item.className = "account-item" + (account.id === editingId ? " is-active" : "");
      item.innerHTML =
        "<div><h3></h3><p></p></div>" +
        '<div class="account-item-actions">' +
          '<button type="button" class="ghost-btn" data-edit>Edit</button>' +
          '<button type="button" class="ghost-btn" data-delete>Delete</button>' +
        "</div>";
      item.querySelector("h3").textContent = store.accountLabel(account);
      item.querySelector("p").textContent = [account.whatsapp, account.fiverrId].filter(Boolean).join(" · ") || "No extra details";
      item.querySelector("[data-edit]").addEventListener("click", function () {
        fillAccountEditor(account);
        renderAccountList();
      });
      item.querySelector("[data-delete]").addEventListener("click", function () {
        if (!window.confirm("Delete this account? Existing orders will keep their saved details.")) return;
        store.deleteAccount(account.id);
        if (accountSelect.value === account.id) accountSelect.value = "";
        fillAccountEditor(null);
        populateAccounts();
        renderAccountList();
        showToast("Account deleted");
      });
      accountList.appendChild(item);
    });
  }

  function syncAccountTabs(message) {
    if (!isAdmin()) return;
    if (!window.OwlisticSheet || typeof window.OwlisticSheet.ensureTabs !== "function") return;
    const accounts = store.getAccounts();
    window.OwlisticSheet.ensureTabs(accounts).then(function (result) {
      if (message && accounts.length && !(result && result.skipped)) {
        showToast(message);
      }
    }).catch(function () {});
  }

  function openAccountModal() {
    if (!isAdmin()) return;
    lastFocus = document.activeElement;
    fillAccountEditor(null);
    renderAccountList();
    accountModal.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("account-name").focus();
    syncAccountTabs(store.getAccounts().length ? "Sheet tabs created for each account" : "");
  }

  function closeAccountModal() {
    accountModal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function openPriceModal() {
    lastFocus = document.activeElement;
    priceModal.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("price-modal-close").focus();
  }

  function closePriceModal() {
    priceModal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function clearOrderSpecific() {
    document.getElementById("order-id").value = "";
    document.getElementById("orderValue").value = "";
    document.getElementById("searchKeyword").value = "";
    document.getElementById("order-custom").checked = false;
    document.getElementById("order-direct").checked = false;
    document.getElementById("messageText").value = "";
    document.getElementById("directRequirements").value = "";
    document.getElementById("reviewText").value = "";
    document.getElementById("business-name").value = "";
    document.getElementById("client-name").value = "";
    if (boardStatusSelect) boardStatusSelect.value = "in-progress";
    fileInput.value = "";
    requirementFiles = [];
    revisions = [];
    readyToggle.checked = false;
    editMeta.hidden = true;
    submitBtn.textContent = "Submit Form";
    if (deleteOrderBtn) deleteOrderBtn.hidden = true;
    refreshRequirementFiles();
    renderRevisions();
    updateStatusUI();
  }

  function goToDefaultPage() {
    window.clearTimeout(persistTimer);
    persistTimer = null;
    clearOrderSpecific();
    document.getElementById("whatsapp").value = "";
    document.getElementById("name").value = "";
    setPayment("paymentStatus", "");
    document.getElementById("fiverrId").value = "";
    document.getElementById("fiverrGigUrl").value = "";
    populateAccounts();
    if (isAdmin()) {
      accountSelect.value = "";
    } else {
      lockAccountUi();
      applyAccount(lockedAccount());
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", "index.html");
    }
    window.scrollTo(0, 0);
    if (isAdmin() && accountSelect && typeof accountSelect.focus === "function") {
      accountSelect.focus();
    }
  }

  function collectOrder() {
    const account = lockedAccount();
    if (account) accountSelect.value = account.id;
    return {
      id: document.getElementById("order-id").value || undefined,
      accountId: account && account.id ? account.id : "",
      accountName: store.accountLabel(account),
      whatsapp: document.getElementById("whatsapp").value.trim(),
      name: document.getElementById("name").value.trim(),
      businessName: document.getElementById("business-name").value.trim(),
      clientName: document.getElementById("client-name").value.trim(),
      boardStatus: boardStatusSelect ? boardStatusSelect.value : "",
      orderValue: document.getElementById("orderValue").value,
      paymentStatus: selectedPayment("paymentStatus"),
      searchKeyword: document.getElementById("searchKeyword").value.trim(),
      orderTypeCustom: document.getElementById("order-custom").checked,
      orderTypeDirect: document.getElementById("order-direct").checked,
      messageText: document.getElementById("messageText").value,
      directRequirements: document.getElementById("directRequirements").value,
      requirementFiles: requirementFiles,
      fiverrId: document.getElementById("fiverrId").value.trim(),
      fiverrGigUrl: document.getElementById("fiverrGigUrl").value.trim(),
      reviewText: document.getElementById("reviewText").value,
      revisions: revisions,
      readyToApprove: boardStatusSelect
        ? (boardStatusSelect.value === "completed" || boardStatusSelect.value === "ready-to-approve")
        : readyToggle.checked
    };
  }

  function saveOrder(silent) {
    return store.saveFileBlobs(fileInput.files).then(function (newFiles) {
      if (newFiles.length) {
        requirementFiles = requirementFiles.concat(newFiles);
        fileInput.value = "";
      }
      const saved = store.upsertOrder(collectOrder());
      document.getElementById("order-id").value = saved.id;
      submitBtn.textContent = "Save Changes";
      editMeta.hidden = false;
      if (deleteOrderBtn) deleteOrderBtn.hidden = false;
      editMeta.textContent = "Editing " + saved.id + " · Created " + store.formatDateTime(saved.createdAt) + " · Last updated " + store.formatDateTime(saved.updatedAt);
      refreshRequirementFiles();
      updateStatusUI();
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", "index.html?order=" + encodeURIComponent(saved.id));
      }
      const sheet = window.OwlisticSheet;
      const syncPromise = sheet
        ? sheet.sync(saved, { forceUploads: !silent })
        : Promise.resolve({ skipped: true });
      return syncPromise.then(function (result) {
        const afterSync = (!silent && sheet && typeof sheet.fetchOrders === "function")
          ? sheet.fetchOrders().then(function (list) {
            if (list && list.ok && list.orders) {
              store.importOrders(list.orders);
              const updated = store.getOrder(saved.id);
              if (updated && updated.requirementFiles) {
                requirementFiles = updated.requirementFiles.slice();
                refreshRequirementFiles();
              }
            }
            return result;
          }).catch(function () {
            return result;
          })
          : Promise.resolve(result);
        return afterSync.then(function (sheetResult) {
          if (!silent) {
            if (sheetResult && sheetResult.skipped) {
              showToast("Order " + saved.id + " saved locally. Connect Google Sheet to sync.");
            } else if (sheetResult && sheetResult.skippedLarge && sheetResult.skippedLarge.length) {
              showToast("Saved. Files over 8 MB were kept on this device only.");
            } else {
              showToast("Order " + saved.id + " saved");
            }
          }
          return { saved: saved, sheet: sheetResult || { ok: true } };
        });
      }).catch(function () {
        if (!silent) showToast("Order " + saved.id + " saved locally, but Google Sheet sync failed");
        return { saved: saved, sheetFailed: true };
      });
    });
  }

  function loadOrder(order) {
    document.getElementById("order-id").value = order.id;
    populateAccounts(order.accountId || "");
    document.getElementById("whatsapp").value = order.whatsapp || "";
    document.getElementById("name").value = order.name || "";
    document.getElementById("business-name").value = order.businessName || "";
    document.getElementById("client-name").value = order.clientName || "";
    if (boardStatusSelect) {
      boardStatusSelect.value = (store.boardStatusOf && store.boardStatusOf(order)) || "in-progress";
    }
    document.getElementById("orderValue").value = order.orderValue || "";
    setPayment("paymentStatus", order.paymentStatus || "");
    document.getElementById("searchKeyword").value = order.searchKeyword || "";
    document.getElementById("order-custom").checked = Boolean(order.orderTypeCustom);
    document.getElementById("order-direct").checked = !order.orderTypeCustom && Boolean(order.orderTypeDirect);
    document.getElementById("messageText").value = order.messageText || "";
    document.getElementById("directRequirements").value = order.directRequirements || "";
    document.getElementById("fiverrId").value = order.fiverrId || "";
    document.getElementById("fiverrGigUrl").value = order.fiverrGigUrl || "";
    document.getElementById("reviewText").value = order.reviewText || "";
    requirementFiles = (order.requirementFiles || []).slice();
    revisions = store.normalizeRevisions(order.revisions || []);
    readyToggle.checked = Boolean(order.readyToApprove);
    fileInput.value = "";
    submitBtn.textContent = "Save Changes";
    editMeta.hidden = false;
    if (deleteOrderBtn) deleteOrderBtn.hidden = false;
    editMeta.textContent = "Editing " + order.id + " · Created " + store.formatDateTime(order.createdAt) + " · Last updated " + store.formatDateTime(order.updatedAt);
    refreshRequirementFiles();
    renderRevisions();
    updateStatusUI();
  }

  function bootForm() {
    populateAccounts();
    refreshRequirementFiles();
    renderRevisions();
    updateStatusUI();

    const existingId = new URLSearchParams(window.location.search).get("order");
    if (existingId) {
      const existing = store.getOrder(existingId);
      if (existing && auth.canSeeOrder(existing)) {
        loadOrder(existing);
      } else if (existing) {
        showToast("You can only open orders for your account.");
        goToDefaultPage();
      }
    } else if (!isAdmin()) {
      applyAccount(lockedAccount());
    }
  }

  if (window.OwlisticSheet && typeof window.OwlisticSheet.fetchOrders === "function") {
    window.OwlisticSheet.fetchOrders().then(function (result) {
      if (result && result.orders && result.orders.length) {
        store.importOrders(result.orders);
      }
      bootForm();
    }).catch(bootForm);
  } else {
    bootForm();
  }

  accountSelect.addEventListener("change", function () {
    applyAccount(store.getAccount(accountSelect.value));
    maybePersist();
  });

  document.getElementById("manage-accounts").addEventListener("click", openAccountModal);
  document.getElementById("account-modal-close").addEventListener("click", closeAccountModal);
  accountModal.addEventListener("click", function (event) {
    if (event.target.hasAttribute("data-close-accounts")) closeAccountModal();
  });
  document.getElementById("account-reset").addEventListener("click", function () {
    fillAccountEditor(null);
    renderAccountList();
  });
  accountEditor.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!isAdmin()) return;
    const saved = store.upsertAccount({
      id: document.getElementById("account-edit-id").value || undefined,
      name: document.getElementById("account-name").value.trim(),
      whatsapp: document.getElementById("account-whatsapp").value.trim(),
      personName: document.getElementById("account-person-name").value.trim(),
      paymentStatus: selectedPayment("accountPaymentStatus"),
      fiverrId: document.getElementById("account-fiverr-id").value.trim(),
      fiverrGigUrl: document.getElementById("account-fiverr-url").value.trim()
    });
    populateAccounts(saved.id);
    applyAccount(saved);
    fillAccountEditor(saved);
    renderAccountList();
    syncAccountTabs("Account saved. Sheet tab created.");
  });

  document.getElementById("check-prices").addEventListener("click", openPriceModal);
  document.getElementById("price-modal-close").addEventListener("click", closePriceModal);
  priceModal.addEventListener("click", function (event) {
    if (event.target.hasAttribute("data-close-modal")) closePriceModal();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!accountModal.hidden) closeAccountModal();
    else if (!priceModal.hidden) closePriceModal();
  });

  fileInput.addEventListener("change", refreshRequirementFiles);
  ["dragenter", "dragover"].forEach(function (type) {
    drop.addEventListener(type, function (event) {
      event.preventDefault();
      drop.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (type) {
    drop.addEventListener(type, function (event) {
      event.preventDefault();
      drop.classList.remove("is-dragover");
    });
  });
  drop.addEventListener("drop", function (event) {
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files || !files.length) return;
    const transfer = new DataTransfer();
    Array.from(fileInput.files || []).concat(Array.from(files)).forEach(function (file) {
      transfer.items.add(file);
    });
    fileInput.files = transfer.files;
    refreshRequirementFiles();
  });

  document.getElementById("add-revision").addEventListener("click", function () {
    if (!canAddNextRevision()) {
      showToast("Complete the current revision before adding the next one.");
      return;
    }
    const revision = {
      id: store.uid("rev"),
      number: revisions.length + 1,
      createdAt: store.nowIso(),
      completed: false,
      messages: []
    };
    addMessage(revision, "buyer");
    revisions.push(revision);
    if (boardStatusSelect && boardStatusSelect.value !== "on-revision") {
      boardStatusSelect.value = "on-revision";
    }
    renderRevisions();
    updateStatusUI();
    maybePersist();
  });

  revisionsList.addEventListener("click", function (event) {
    const editBtn = event.target.closest("[data-edit-message]");
    if (editBtn) {
      const field = revisionsList.querySelector('[data-message-text="' + editBtn.getAttribute("data-edit-message") + '"]');
      const card = event.target.closest("[data-message-card]");
      revisionsList.querySelectorAll(".chat-bubble.is-editing").forEach(function (el) {
        el.classList.remove("is-editing");
      });
      if (card) card.classList.add("is-editing");
      if (field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
      return;
    }

    const deleteRevisionBtn = event.target.closest("[data-delete-revision]");
    if (deleteRevisionBtn) {
      removeRevision(deleteRevisionBtn.getAttribute("data-delete-revision"));
      renderRevisions();
      maybePersist();
      showToast("Revision deleted");
      return;
    }

    const deleteRowBtn = event.target.closest("[data-delete-row]");
    if (deleteRowBtn) {
      const revision = findRevision(deleteRowBtn.getAttribute("data-revision-id"));
      if (!revision) return;
      removePair(revision, Number(deleteRowBtn.getAttribute("data-delete-row")));
      renderRevisions();
      maybePersist();
      showToast("Row deleted");
      return;
    }

    const deleteMessageBtn = event.target.closest("[data-delete-message]");
    if (deleteMessageBtn) {
      const revision = findRevision(deleteMessageBtn.getAttribute("data-revision-id"));
      if (!revision) return;
      removeMessage(revision, deleteMessageBtn.getAttribute("data-delete-message"));
      renderRevisions();
      maybePersist();
      showToast("Message deleted");
      return;
    }

    const nextRow = event.target.closest("[data-add-next-row]");
    const button = nextRow || event.target.closest("[data-add-message]");
    if (!button) return;
    const revision = findRevision(button.getAttribute("data-revision-id"));
    if (!revision) return;
    const role = nextRow ? "buyer" : button.getAttribute("data-add-message");
    if (!canAddMessage(revision, role)) {
      showToast(addHint(revision, role));
      return;
    }
    addMessage(revision, role);
    renderRevisions();
    maybePersist();
  });

  revisionsList.addEventListener("change", function (event) {
    const filesInput = event.target.closest("[data-message-files]");
    if (!filesInput || !filesInput.files || !filesInput.files.length) return;
    const message = findMessage(filesInput.getAttribute("data-message-files"));
    if (!message) return;
    store.saveFileBlobs(filesInput.files).then(function (saved) {
      message.files = (message.files || []).concat(saved);
      filesInput.value = "";
      renderRevisions();
      maybePersist();
    });
  });

  revisionsList.addEventListener("change", function (event) {
    const box = event.target.closest("[data-complete-revision]");
    if (!box) return;
    const revision = findRevision(box.getAttribute("data-complete-revision"));
    if (!revision) return;
    revision.completed = box.checked;
    renderRevisions();
    maybePersist();
    if (box.checked && canAddNextRevision()) {
      showToast("All revisions complete. Set status to Ready to Approve when it is ready.");
    } else if (box.checked) {
      showToast("Revision completed. The next revision is now showing.");
    }
  });

  revisionsList.addEventListener("input", function (event) {
    const field = event.target.closest("[data-message-text]");
    if (!field) return;
    const message = findMessage(field.getAttribute("data-message-text"));
    if (message) message.text = field.value;
    updateRevisionActionButtons();
    maybePersist();
  });

  readyToggle.addEventListener("change", function () {
    if (boardStatusSelect) {
      if (readyToggle.checked) {
        if (boardStatusSelect.value !== "completed") boardStatusSelect.value = "ready-to-approve";
      } else if (boardStatusSelect.value === "ready-to-approve" || boardStatusSelect.value === "completed") {
        boardStatusSelect.value = "in-progress";
      }
    }
    updateStatusUI();
    maybePersist();
  });

  if (boardStatusSelect) {
    boardStatusSelect.addEventListener("change", function () {
      readyToggle.checked = boardStatusSelect.value === "completed" || boardStatusSelect.value === "ready-to-approve";
      updateStatusUI();
      maybePersist();
    });
  }

  ["business-name", "client-name"].forEach(function (id) {
    const field = document.getElementById(id);
    if (!field) return;
    field.addEventListener("input", maybePersist);
  });

  function refreshSheetConnect() {
    const panel = document.getElementById("sheet-connect");
    const input = document.getElementById("sheet-web-app-url");
    const status = document.getElementById("sheet-connect-status");
    if (!panel || !window.OwlisticSheet) return;
    const connected = window.OwlisticSheet.isConfigured();
    panel.classList.toggle("is-connected", connected);
    input.value = window.OwlisticSheet.getWebAppUrl();
    status.textContent = connected
      ? "Connected to Ashar Orders Management System. Each account gets its own tab; submitted orders go to that tab."
      : "Google needs a one-time Apps Script deploy. Copy the script, deploy it as a web app, then paste the URL here.";
  }

  refreshSheetConnect();

  document.getElementById("save-sheet-url").addEventListener("click", function () {
    window.OwlisticSheet.setWebAppUrl(document.getElementById("sheet-web-app-url").value);
    refreshSheetConnect();
    showToast(window.OwlisticSheet.isConfigured() ? "Google Sheet connected" : "Paste the Apps Script web app URL ending in /exec");
  });

  document.getElementById("copy-sheet-script").addEventListener("click", function () {
    const source = window.OwlisticSheet.scriptSource || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(source).then(function () {
        showToast("Script copied. In your sheet: Extensions → Apps Script → paste → Deploy");
      });
    }
  });

  document.getElementById("new-order-btn").addEventListener("click", function () {
    const selected = accountSelect.value;
    clearOrderSpecific();
    if (selected) {
      accountSelect.value = selected;
      applyAccount(store.getAccount(selected));
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", "index.html");
    }
  });

  if (deleteOrderBtn) {
    deleteOrderBtn.addEventListener("click", function () {
      const id = document.getElementById("order-id").value;
      const order = id ? (store.getOrder(id) || store.getOrder(id)) : null;
      if (!order) {
        showToast("Save this order first, then you can delete it.");
        return;
      }
      const canSee = auth.canSeeOrder || auth.canSeeOrder;
      if (typeof canSee === "function" && !canSee.call(auth, order)) {
        showToast("You can only delete orders for your account.");
        return;
      }
      const sheet = window.OwlisticSheet;
      if (sheet && typeof sheet.confirmDelete === "function") {
        if (!sheet.confirmDelete(order)) return;
      } else if (!window.confirm("Do you wish to delete order " + order.id + "?\n\nThis will remove it from the portal and from the Google Sheet.")) {
        return;
      }
      deleteOrderBtn.disabled = true;
      const after = function (result) {
        deleteOrderBtn.disabled = false;
        if (result && result.sheetRemaining) {
          showToast("Deleted from the portal. Deploy Apps Script to remove the Google Sheet row too.");
        } else {
          showToast("Order " + order.id + " deleted");
        }
        window.setTimeout(function () {
          window.location.href = "records.html";
        }, 700);
      };
      if (sheet && typeof sheet.removeOrder === "function") {
        sheet.removeOrder(order).then(after).catch(function () {
          if (store.deleteOrder) store.deleteOrder(order.id);
          after({ ok: true });
        });
        return;
      }
      if (store.deleteOrder) store.deleteOrder(order.id);
      if (sheet && typeof sheet.deleteOrder === "function") sheet.deleteOrder(order);
      after({ ok: true });
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    window.clearTimeout(persistTimer);
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving to Google Sheet…";
    saveOrder(false).then(function (outcome) {
      const saved = outcome && outcome.saved;
      if (!outcome || outcome.sheetFailed || (outcome.sheet && outcome.sheet.skipped)) {
        return;
      }
      goToDefaultPage();
      showToast("Order " + saved.id + " saved to Google Sheet");
    }).catch(function () {
      showToast("Could not save this order");
    }).then(function () {
      isSubmitting = false;
      submitBtn.disabled = false;
      if (!document.getElementById("order-id").value) {
        submitBtn.textContent = "Submit Form";
      } else {
        submitBtn.textContent = "Save Changes";
      }
    });
  });
})();
