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
  const messageThreadEl = document.getElementById("message-thread");
  const boardStatusSelect = document.getElementById("board-status");
  const submitBtn = document.getElementById("submit-form");
  const deleteOrderBtn = document.getElementById("delete-order-btn");
  const urlFields = ["fiverrGigUrl", "account-fiverr-url"].map(function (id) {
    return document.getElementById(id);
  }).filter(Boolean);

  function growUrlField(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(42, el.scrollHeight) + "px";
  }

  function growUrlFields() {
    urlFields.forEach(growUrlField);
  }

  let lastFocus = null;
  let requirementFiles = [];
  let revisions = [];
  let threadMessages = [];
  let persistTimer = null;
  let isSubmitting = false;
  let saveQueue = Promise.resolve();
  let ingestQueue = Promise.resolve();
  let activeSheetSave = null;

  function showToast(message, duration) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.hidden = true;
    }, duration || 2400);
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
    page.classList.remove("has-revision", "is-ready");
    if (banner) {
      banner.hidden = true;
      banner.classList.remove("is-revision", "is-ready");
    }
  }

  function fieldValue(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function sameText(left, right) {
    return String(left || "").trim() === String(right || "").trim();
  }

  function selectedAccount() {
    return lockedAccount() || store.getAccount(accountSelect && accountSelect.value);
  }

  function formHasFilledOrderData() {
    const account = selectedAccount() || {};
    if (fieldValue("orderValue")) return true;
    if (fieldValue("searchKeyword")) return true;
    if (document.getElementById("order-custom") && document.getElementById("order-custom").checked) return true;
    if (document.getElementById("order-direct") && document.getElementById("order-direct").checked) return true;
    if (fieldValue("directRequirements")) return true;
    if (fieldValue("reviewText")) return true;
    if (fieldValue("messageText")) return true;
    if (typeof threadHasContent === "function" && threadHasContent()) return true;
    if (requirementFiles.length) return true;
    if (revisions.length) return true;
    if (fileInput && fileInput.files && fileInput.files.length) return true;
    if (fieldValue("whatsapp") && !sameText(fieldValue("whatsapp"), account.whatsapp)) return true;
    if (fieldValue("name") && !sameText(fieldValue("name"), account.personName)) return true;
    if (fieldValue("fiverrId") && !sameText(fieldValue("fiverrId"), account.fiverrId)) return true;
    if (fieldValue("fiverrGigUrl") && !sameText(fieldValue("fiverrGigUrl"), account.fiverrGigUrl)) return true;
    const payment = selectedPayment("paymentStatus");
    if (payment && !sameText(payment, account.paymentStatus)) return true;
    return false;
  }

  function hasPersistableContent() {
    return formHasFilledOrderData();
  }

  function maybePersist() {
    if (isSubmitting) return;
    if (!hasPersistableContent()) return;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(function () {
      saveOrder(true).catch(function () {});
    }, 450);
  }

  function storedBlob(record) {
    return record && (record.blob || record.blob);
  }

  function openRequirementFile(file) {
    if (file && file.pendingBlob) {
      window.open(URL.createObjectURL(file.pendingBlob), "_blank", "noopener");
      return;
    }
    if (file && file.url) {
      window.open(fileDownloadHref(file) || file.url, "_blank", "noopener");
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
    if (file && file.pendingBlob) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file.pendingBlob);
      link.download = file.name || "file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
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

  function isImageFile(file) {
    return store.isImageFile ? store.isImageFile(file) : /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(String((file && file.name) || ""));
  }

  function filePreviewSrc(file) {
    return store.filePreviewUrl ? store.filePreviewUrl(file) : (file && file.url) || "";
  }

  function filePreviewSrcs(file) {
    if (store.filePreviewUrls) return store.filePreviewUrls(file);
    const src = filePreviewSrc(file);
    return src ? [src] : [];
  }

  function fileDownloadHref(file) {
    return store.fileDownloadUrl ? store.fileDownloadUrl(file) : (file && file.url) || "";
  }

  function bindPreviewImage(img, file) {
    if (!isImageFile(file)) return;
    if (file.pendingBlob) {
      img.src = URL.createObjectURL(file.pendingBlob);
      img.hidden = false;
      return;
    }
    const remotes = filePreviewSrcs(file);
    if (remotes.length) {
      let index = 0;
      img.src = remotes[0];
      img.hidden = false;
      img.addEventListener("error", function () {
        index += 1;
        if (index < remotes.length) img.src = remotes[index];
      });
      return;
    }
    if (!file.id || typeof store.getFile !== "function") return;
    store.getFile(file.id).then(function (record) {
      const blob = storedBlob(record);
      if (!blob) return;
      img.src = URL.createObjectURL(blob);
      img.hidden = false;
    });
  }

  function renderFileList(target, files, onChange) {
    target.innerHTML = "";
    files.forEach(function (file, index) {
      const item = document.createElement("li");
      item.className = "file-list-item";

      const preview = document.createElement("div");
      preview.className = "file-preview";
      if (isImageFile(file)) {
        const img = document.createElement("img");
        img.className = "file-preview-img";
        img.alt = file.name || "image";
        img.hidden = true;
        img.referrerPolicy = "no-referrer";
        bindPreviewImage(img, file);
        preview.appendChild(img);
      } else {
        const icon = document.createElement("span");
        icon.className = "file-preview-icon";
        icon.textContent = "File";
        preview.appendChild(icon);
      }

      const info = document.createElement("span");
      info.className = "file-preview-name";
      info.textContent = file.name + (file.uploadedAt ? " · " + store.formatDateTime(file.uploadedAt) : "");

      const actions = document.createElement("span");
      actions.className = "file-preview-actions";

      if (file.id || file.url || file.pendingBlob) {
        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.textContent = "Open";
        openBtn.addEventListener("click", function () {
          openRequirementFile(file);
        });
        actions.appendChild(openBtn);

        const downloadBtn = document.createElement("a");
        downloadBtn.textContent = "Download";
        downloadBtn.className = "file-download-link";
        const href = fileDownloadHref(file);
        if (href) {
          downloadBtn.href = href;
          downloadBtn.target = "_blank";
          downloadBtn.rel = "noopener noreferrer";
          downloadBtn.setAttribute("download", file.name || "file");
        } else {
          downloadBtn.href = "#";
          downloadBtn.addEventListener("click", function (event) {
            event.preventDefault();
            downloadRequirementFile(file);
          });
        }
        actions.appendChild(downloadBtn);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", function () {
        const removed = files[index];
        files.splice(index, 1);
        if (removed && removed.pendingBlob && fileInput) {
          const transfer = new DataTransfer();
          Array.from(fileInput.files || []).forEach(function (item) {
            if (item !== removed.pendingBlob) transfer.items.add(item);
          });
          fileInput.files = transfer.files;
        }
        if (onChange) onChange();
      });
      actions.appendChild(removeBtn);

      const body = document.createElement("div");
      body.className = "file-preview-body";
      body.appendChild(info);
      body.appendChild(actions);
      item.appendChild(preview);
      item.appendChild(body);
      target.appendChild(item);
    });
  }

  function pendingRequirementFiles() {
    return Array.from((fileInput && fileInput.files) || []).map(function (file) {
      return {
        name: file.name,
        type: file.type,
        size: file.size,
        pendingBlob: file
      };
    });
  }

  function refreshRequirementFiles() {
    const extra = fileInput.files && fileInput.files.length
      ? Array.from(fileInput.files).map(function (file) { return file.name; }).join(", ")
      : "";
    fileName.textContent = extra;
    fileName.classList.toggle("is-visible", Boolean(extra));
    renderFileList(requirementList, requirementFiles.concat(pendingRequirementFiles()), function () {
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

  function visibleFormRevisions() {
    return revisions.slice();
  }

  function updateAddRevisionButton() {
    const button = document.getElementById("add-revision");
    if (!button) return;
    const nextNumber = revisions.length + 1;
    button.disabled = false;
    button.textContent = "+ Add Revision";
    button.title = revisions.length ? "Add revision " + nextNumber : "Add revision 1";
  }

  function updateRevisionsCount() {
    const countEl = document.getElementById("revisions-count");
    if (!countEl) return;
    const count = revisions.length;
    if (!count) {
      countEl.textContent = "0 revisions";
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
      return !last;
    }
    if (!last || !messageFilled(last.buyer)) return false;
    if (last.seller && !messageFilled(last.seller)) return false;
    return !last.seller;
  }

  function canStartNextRevision() {
    if (!revisions.length) return true;
    const last = revisions[revisions.length - 1];
    const pair = lastPair(last);
    const number = last && last.number ? last.number : revisions.length;
    if (!pair || !messageFilled(pair.buyer)) return false;
    if (!messageFilled(pair.seller)) return false;
    return true;
  }

  function addHint(revision, role) {
    const last = lastPair(revision);
    const number = revision && revision.number ? revision.number : pairNumber(revision);
    if (role === "buyer") {
      if (last) return "Use Add Revision to start Revision " + (number + 1);
      return "Fill Buyer Message " + number + " first";
    }
    if (!last || !messageFilled(last.buyer)) return "Fill Buyer Message " + number + " first";
    if (last.seller && !messageFilled(last.seller)) return "Fill Seller Message " + number + " before adding another";
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

  function nextRowButtonHtml() {
    const nextNumber = revisions.length + 1;
    const allowed = canStartNextRevision();
    const last = revisions.length ? revisions[revisions.length - 1] : null;
    const hint = allowed
      ? "This starts Revision " + nextNumber + ": Buyer Message " + nextNumber + " on the left, Seller Message " + nextNumber + " on the right."
      : (last ? addHint(last, messageFilled(lastPair(last) && lastPair(last).seller) ? "buyer" : "seller") : "Add Revision 1 first");
    return '<div class="chat-next">' +
      '<button type="button" class="next-row-btn" data-add-next-row' + (allowed ? "" : " disabled") + ' title="' + escapeHtml(allowed ? "Add Revision " + nextNumber : hint) + '">' +
        "+ Add Revision " + nextNumber +
      "</button>" +
      '<p data-next-hint>' + escapeHtml(hint) + "</p>" +
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
        if (copy && role === "seller") {
          const number = revision && revision.number ? revision.number : 1;
          copy.textContent = allowed
            ? "Buyer Message " + number + " is ready. Add Seller Message " + number + "."
            : "Fill Buyer Message " + number + " first.";
        }
      }
    });
    revisionsList.querySelectorAll("[data-add-next-row]").forEach(function (button) {
      const allowed = canStartNextRevision();
      const nextNumber = revisions.length + 1;
      const last = revisions.length ? revisions[revisions.length - 1] : null;
      const hint = allowed
        ? "This starts Revision " + nextNumber + ": Buyer Message " + nextNumber + " on the left, Seller Message " + nextNumber + " on the right."
        : (last ? addHint(last, "seller") : "Add Revision 1 first");
      button.disabled = !allowed;
      button.title = allowed ? "Add Revision " + nextNumber : hint;
      const copy = button.parentNode && button.parentNode.querySelector("p");
      if (copy) copy.textContent = hint;
    });
  }

  function renderRevisions() {
    if (store.normalizeRevisions) {
      revisions = store.normalizeRevisions(revisions);
    }
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

    visibleFormRevisions().forEach(function (revision, revisionIndex) {
      const round = document.createElement("article");
      round.className = "revision-round" + (revision.completed ? " is-complete" : "");
      round.setAttribute("data-revision-id", revision.id);

      const messages = revision.messages || [];
      const pairs = pairMessages(messages);
      const number = revision.number || revisionIndex + 1;
      const thread = pairs.length
        ? pairs.slice(0, 1).map(function (pair) {
          return '<div class="chat-pair" data-pair-index="0">' +
            '<div class="chat-step-col">' +
              '<span class="chat-step" aria-hidden="true">' + number + "</span>" +
              '<button type="button" class="chat-row-delete" data-delete-row="0" data-revision-id="' + revision.id + '" title="Delete Revision ' + number + '">Delete row</button>' +
            "</div>" +
            slotHtml(revision, pair.buyer, "buyer", number) +
            slotHtml(revision, pair.seller, "seller", number) +
          "</div>";
        }).join("")
        : '<p class="chat-empty">No comments in this revision yet.</p>';

      round.innerHTML =
        '<div class="revision-round-head">' +
          "<div>" +
            '<p class="revision-title">Revision ' + number + "</p>" +
            '<p class="revision-meta">' + store.formatDateTime(revision.createdAt) + "</p>" +
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
          (revisionIndex === revisions.length - 1 ? nextRowButtonHtml() : "") +
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

  function emptyMessageThread() {
    return [{
      id: store.uid("mt"),
      role: "buyer",
      createdAt: store.nowIso(),
      text: "",
      files: []
    }];
  }

  function threadHasContent() {
    return threadMessages.some(function (message) {
      return String(message.text || "").trim() || (message.files && message.files.length);
    });
  }

  function threadMessageRole(message) {
    return message && (message.role === "client" || message.role === "seller" || message.kind === "seller")
      ? "client"
      : "buyer";
  }

  function threadFilled(message) {
    if (!message) return false;
    return Boolean(String(message.text || "").trim() || (message.files && message.files.length));
  }

  function pairThread(list) {
    const pairs = [];
    let pendingBuyer = null;
    (list || []).forEach(function (message) {
      if (threadMessageRole(message) === "buyer") {
        if (pendingBuyer) pairs.push({ buyer: pendingBuyer, client: null });
        pendingBuyer = message;
        return;
      }
      pairs.push({ buyer: pendingBuyer, client: message });
      pendingBuyer = null;
    });
    if (pendingBuyer) pairs.push({ buyer: pendingBuyer, client: null });
    return pairs;
  }

  function lastThreadPair() {
    const pairs = pairThread(threadMessages);
    return pairs.length ? pairs[pairs.length - 1] : null;
  }

  function threadPairNumber() {
    return pairThread(threadMessages).length || 1;
  }

  function canAddThread(role) {
    const last = lastThreadPair();
    if (role === "buyer") {
      if (!last) return true;
      if (!threadFilled(last.buyer)) return false;
      if (!threadFilled(last.client)) return false;
      return true;
    }
    if (!last || !threadFilled(last.buyer)) return false;
    if (last.client && !threadFilled(last.client)) return false;
    return !last.client;
  }

  function threadHint(role) {
    const last = lastThreadPair();
    const number = threadPairNumber();
    if (role === "buyer") {
      if (last && !threadFilled(last.buyer)) return "Fill Buyer Message " + number + " before adding another";
      if (last && !threadFilled(last.client)) return "Add Client Reply " + number + " first";
      return "Fill the current buyer message before adding another";
    }
    if (!last || !threadFilled(last.buyer)) return "Fill Buyer Message " + number + " first";
    return "Fill Buyer Message " + number + " first";
  }

  function addThreadMessage(role) {
    threadMessages.push({
      id: store.uid("mt"),
      role: role,
      createdAt: store.nowIso(),
      text: "",
      files: []
    });
  }

  function findThreadMessage(id) {
    return threadMessages.find(function (item) { return item.id === id; }) || null;
  }

  function removeThreadMessage(messageId) {
    const index = threadMessages.findIndex(function (item) { return item.id === messageId; });
    if (index === -1) return;
    if (threadMessageRole(threadMessages[index]) === "buyer") {
      const removeCount = threadMessages[index + 1] && threadMessageRole(threadMessages[index + 1]) === "client" ? 2 : 1;
      threadMessages.splice(index, removeCount);
    } else {
      threadMessages.splice(index, 1);
    }
    if (!threadMessages.length) threadMessages = emptyMessageThread();
  }

  function removeThreadPair(pairIndex) {
    const pairs = pairThread(threadMessages);
    const pair = pairs[pairIndex];
    if (!pair) return;
    const ids = {};
    if (pair.buyer) ids[pair.buyer.id] = true;
    if (pair.client) ids[pair.client.id] = true;
    threadMessages = threadMessages.filter(function (item) { return !ids[item.id]; });
    if (!threadMessages.length) threadMessages = emptyMessageThread();
  }

  function threadBubbleHtml(message, role, number) {
    const label = role === "client" ? "Client Reply " + number : "Buyer Message " + number;
    const placeholder = role === "client" ? "Write client reply " + number : "Write buyer message " + number;
    const pill = role === "client" ? "Client" : "Buyer";
    const cls = role === "client" ? "seller" : "buyer";
    return '<div class="chat-bubble is-' + cls + '" data-mt-card="' + message.id + '">' +
      '<div class="chat-bubble-head">' +
        '<div class="chat-bubble-heading">' +
          '<span class="chat-pill">' + pill + "</span>" +
          '<p class="chat-label">' + label + "</p>" +
        "</div>" +
        '<div class="chat-card-actions">' +
          '<button type="button" class="chat-card-btn is-edit" data-mt-edit="' + message.id + '">Edit</button>' +
          '<button type="button" class="chat-card-btn is-delete" data-mt-delete="' + message.id + '">Delete</button>' +
        "</div>" +
      "</div>" +
      '<p class="chat-time">' + store.formatDateTime(message.createdAt) + "</p>" +
      '<textarea data-mt-text="' + message.id + '" placeholder="' + placeholder + '">' + escapeHtml(message.text || "") + "</textarea>" +
      '<label class="chat-attach">' +
        '<input type="file" multiple data-mt-files="' + message.id + '" />' +
        "<span>Attach files</span>" +
      "</label>" +
      '<ul class="file-list" data-mt-file-list="' + message.id + '"></ul>' +
    "</div>";
  }

  function threadEmptyHtml(role, number) {
    const canAdd = canAddThread(role);
    if (role === "client") {
      return '<div class="chat-wait is-seller' + (canAdd ? " is-ready" : "") + '">' +
        '<span class="chat-pill">Client</span>' +
        '<p class="chat-label">Client Reply ' + number + "</p>" +
        '<p class="chat-wait-copy" data-mt-wait-copy>' + (canAdd ? "Buyer Message " + number + " is ready. Add Client Reply " + number + "." : "Fill Buyer Message " + number + " first.") + "</p>" +
        '<button type="button" class="row-action-btn" data-mt-add="client"' + (canAdd ? "" : " disabled") + ">" +
          "+ Add Client Reply " + number +
        "</button>" +
      "</div>";
    }
    return '<div class="chat-wait is-buyer">' +
      '<span class="chat-pill">Buyer</span>' +
      '<p class="chat-label">Buyer Message ' + number + "</p>" +
      '<p class="chat-wait-copy">This row starts with the buyer.</p>' +
    "</div>";
  }

  function threadSlotHtml(message, role, number) {
    return '<div class="chat-slot is-' + (role === "client" ? "seller" : "buyer") + '">' +
      (message ? threadBubbleHtml(message, role, number) : threadEmptyHtml(role, number)) +
    "</div>";
  }

  function syncMessageTextField() {
    const field = document.getElementById("messageText");
    if (!field) return;
    field.value = (store.formatMessageThread ? store.formatMessageThread(threadMessages) : "") || "";
  }

  function renderMessageThread() {
    if (!messageThreadEl) return;
    if (!threadMessages.length) threadMessages = emptyMessageThread();
    const pairs = pairThread(threadMessages);
    const nextNumber = pairs.length + 1;
    const allowed = canAddThread("buyer");
    messageThreadEl.innerHTML =
      '<div class="chat-thread">' +
        '<div class="chat-legend" aria-hidden="true"><span></span><span>Buyer</span><span>Client Reply</span></div>' +
        pairs.map(function (pair, index) {
          const number = index + 1;
          return '<div class="chat-pair" data-mt-pair="' + index + '">' +
            '<div class="chat-step-col">' +
              '<span class="chat-step" aria-hidden="true">' + number + "</span>" +
              '<button type="button" class="chat-row-delete" data-mt-delete-row="' + index + '" title="Delete row ' + number + '">Delete row</button>' +
            "</div>" +
            threadSlotHtml(pair.buyer, "buyer", number) +
            threadSlotHtml(pair.client, "client", number) +
          "</div>";
        }).join("") +
        '<div class="chat-next">' +
          '<button type="button" class="next-row-btn" data-mt-next' + (allowed ? "" : " disabled") + ' title="' + escapeHtml(allowed ? "Add Buyer Message " + nextNumber : threadHint("buyer")) + '">' +
            "+ Add Buyer Message " + nextNumber +
          "</button>" +
          "<p>" + (allowed
            ? "This starts row " + nextNumber + ": Buyer Message " + nextNumber + " on the left, Client Reply " + nextNumber + " on the right."
            : escapeHtml(threadHint("buyer"))) + "</p>" +
        "</div>" +
      "</div>";
    threadMessages.forEach(function (message) {
      const list = messageThreadEl.querySelector('[data-mt-file-list="' + message.id + '"]');
      if (!list) return;
      renderFileList(list, message.files || [], function () {
        renderMessageThread();
        maybePersist();
      });
    });
    syncMessageTextField();
  }

  function updateThreadActionButtons() {
    if (!messageThreadEl) return;
    const clientBtn = messageThreadEl.querySelector('[data-mt-add="client"]');
    if (clientBtn) {
      const allowed = canAddThread("client");
      const number = threadPairNumber();
      clientBtn.disabled = !allowed;
      clientBtn.title = allowed ? "Add Client Reply " + number : threadHint("client");
      const wait = clientBtn.closest(".chat-wait");
      if (wait) {
        wait.classList.toggle("is-ready", allowed);
        const copy = wait.querySelector("[data-mt-wait-copy]");
        if (copy) {
          copy.textContent = allowed
            ? "Buyer Message " + number + " is ready. Add Client Reply " + number + "."
            : "Fill Buyer Message " + number + " first.";
        }
      }
    }
    const nextBtn = messageThreadEl.querySelector("[data-mt-next]");
    if (nextBtn) {
      const allowed = canAddThread("buyer");
      const nextNumber = threadPairNumber() + 1;
      nextBtn.disabled = !allowed;
      nextBtn.title = allowed ? "Add Buyer Message " + nextNumber : threadHint("buyer");
      const hint = nextBtn.parentNode && nextBtn.parentNode.querySelector("p");
      if (hint) {
        hint.textContent = allowed
          ? "This starts row " + nextNumber + ": Buyer Message " + nextNumber + " on the left, Client Reply " + nextNumber + " on the right."
          : threadHint("buyer");
      }
    }
    syncMessageTextField();
  }

  function isAdmin() {
    return auth.isSuperAdmin();
  }

  function lockedAccount() {
    if (isAdmin()) return store.getAccount(accountSelect.value);
    const list = auth.visibleAccounts();
    if (!list.length) return store.getAccount(accountSelect.value);
    const richest = list.slice().sort(function (a, b) {
      function score(acc) {
        return ["whatsapp", "personName", "fiverrId", "fiverrGigUrl"].reduce(function (n, key) {
          return n + (String((acc && acc[key]) || "").trim() ? 1 : 0);
        }, 0);
      }
      return score(b) - score(a);
    })[0];
    if (richest && accountSelect) accountSelect.value = richest.id;
    return richest;
  }

  function lockAccountUi() {
    if (isAdmin()) {
      accountSelect.disabled = false;
      return;
    }
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
    applyAccountIfNewOrder();
  }

  function applyAccountIfNewOrder() {
    if (document.getElementById("order-id") && document.getElementById("order-id").value) return;
    applyAccount(lockedAccount());
  }

  function refreshAccountFromSheet(name) {
    const sheet = window.OwlisticSheet;
    if (!sheet || typeof sheet.fetchAccountProfile !== "function") {
      return Promise.resolve(null);
    }
    const wanted = name || (lockedAccount() && (lockedAccount().name || lockedAccount().username)) || "";
    if (!wanted) return Promise.resolve(null);
    return sheet.fetchAccountProfile(wanted).then(function (profile) {
      if (!profile || profile.ok === false) return null;
      populateAccounts(accountSelect && accountSelect.value);
      applyAccountIfNewOrder();
      return profile;
    }).catch(function () {
      return null;
    });
  }

  function applyAccount(account) {
    if (!account) return;
    document.getElementById("whatsapp").value = account.whatsapp || "";
    document.getElementById("name").value = account.personName || "";
    setPayment("paymentStatus", account.paymentStatus || "");
    document.getElementById("fiverrId").value = account.fiverrId || "";
    document.getElementById("fiverrGigUrl").value = account.fiverrGigUrl || "";
    growUrlFields();
  }

  function fillAccountEditor(account) {
    document.getElementById("account-edit-id").value = account && account.id ? account.id : "";
    document.getElementById("account-name").value = account && account.name ? account.name : "";
    document.getElementById("account-username").value = account && account.username ? account.username : "";
    document.getElementById("account-username-password").value = "";
    document.getElementById("account-whatsapp").value = account && account.whatsapp ? account.whatsapp : "";
    document.getElementById("account-person-name").value = account && account.personName ? account.personName : "";
    document.getElementById("account-fiverr-id").value = account && account.fiverrId ? account.fiverrId : "";
    document.getElementById("account-fiverr-url").value = account && account.fiverrGigUrl ? account.fiverrGigUrl : "";
    setPayment("accountPaymentStatus", account && account.paymentStatus ? account.paymentStatus : "");
    growUrlFields();
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
    threadMessages = emptyMessageThread();
    document.getElementById("directRequirements").value = "";
    document.getElementById("reviewText").value = "";
    if (boardStatusSelect) boardStatusSelect.value = "in-progress";
    fileInput.value = "";
    requirementFiles = [];
    revisions = [];
    editMeta.hidden = true;
    submitBtn.textContent = "Save to Google Sheet";
    if (deleteOrderBtn) deleteOrderBtn.hidden = true;
    refreshRequirementFiles();
    renderMessageThread();
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
    growUrlFields();
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
    syncMessageTextField();
    const existingId = document.getElementById("order-id").value;
    const existing = existingId && store.getOrder(existingId);
    const session = auth.getSession ? auth.getSession() : null;
    const accountName = (account && store.accountLabel(account))
      || (session && session.role !== "superadmin" && session.account)
      || "";
    return {
      id: existingId || undefined,
      accountId: account && account.id ? account.id : "",
      accountName: accountName,
      whatsapp: document.getElementById("whatsapp").value.trim(),
      name: document.getElementById("name").value.trim(),
      businessName: existing && existing.businessName ? existing.businessName : "",
      clientName: existing && existing.clientName ? existing.clientName : "",
      boardStatus: existing && existing.boardStatus
        ? existing.boardStatus
        : (boardStatusSelect ? boardStatusSelect.value : "in-progress"),
      overallStatus: (store.boardStatusLabel && store.boardStatusLabel(
        (existing && existing.boardStatus) || (boardStatusSelect && boardStatusSelect.value) || "in-progress"
      )) || (existing && existing.overallStatus) || "",
      orderValue: document.getElementById("orderValue").value,
      paymentStatus: selectedPayment("paymentStatus"),
      searchKeyword: document.getElementById("searchKeyword").value.trim(),
      orderTypeCustom: document.getElementById("order-custom").checked,
      orderTypeDirect: document.getElementById("order-direct").checked,
      messageThread: threadMessages.slice(),
      messageText: (store.formatMessageThread ? store.formatMessageThread(threadMessages) : "") || document.getElementById("messageText").value,
      directRequirements: document.getElementById("directRequirements").value,
      requirementFiles: requirementFiles,
      fiverrId: document.getElementById("fiverrId").value.trim(),
      fiverrGigUrl: document.getElementById("fiverrGigUrl").value.trim(),
      reviewText: document.getElementById("reviewText").value,
      revisions: revisions,
      readyToApprove: existing
        ? (existing.boardStatus === "completed" || existing.boardStatus === "ready-to-approve" || Boolean(existing.readyToApprove))
        : Boolean(boardStatusSelect && (boardStatusSelect.value === "completed" || boardStatusSelect.value === "ready-to-approve")),
      placeOn: existing ? existing.placeOn : "",
      placementHold: existing ? Boolean(existing.placementHold) : false,
      placementPlaced: existing ? Boolean(existing.placementPlaced) : false,
      placementStatus: existing ? existing.placementStatus : "Unscheduled",
      scheduledBy: existing ? existing.scheduledBy : "",
      scheduleUpdatedAt: existing ? existing.scheduleUpdatedAt : "",
      placedAt: existing ? existing.placedAt : ""
    };
  }

  function applySavedOrder(saved) {
    document.getElementById("order-id").value = saved.id;
    editMeta.hidden = false;
    if (deleteOrderBtn) deleteOrderBtn.hidden = false;
    editMeta.textContent = "Editing " + saved.id + " · Created " + store.formatDateTime(saved.createdAt) + " · Last updated " + store.formatDateTime(saved.updatedAt);
    if (saved.requirementFiles) {
      requirementFiles = store.mergeRequirementFiles
        ? store.mergeRequirementFiles(requirementFiles, saved.requirementFiles)
        : saved.requirementFiles.slice();
    }
    refreshRequirementFiles();
    updateStatusUI();
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", "index.html?order=" + encodeURIComponent(saved.id));
    }
  }

  function mergeRemoteFileUrls(local, remote) {
    if (!local || !remote) return local;
    if (store.mergeRequirementFiles) {
      local.requirementFiles = store.mergeRequirementFiles(local.requirementFiles, remote.requirementFiles);
    }
    const remoteThread = store.messageThreadOf ? store.messageThreadOf(remote) : (remote.messageThread || []);
    if (store.overlayMessageFiles) {
      local.messageThread = store.overlayMessageFiles(local.messageThread, remoteThread);
      local.messageText = store.formatMessageThread(local.messageThread) || local.messageText;
    }
    if (store.overlayRevisionFiles) {
      local.revisions = store.overlayRevisionFiles(local.revisions, remote.revisions);
    }
    return local;
  }

  function refreshFromSheetOrders(list, orderId) {
    if (!list || !list.length) return;
    store.replaceOrders(list);
    const updated = store.getOrder(orderId);
    if (updated && updated.requirementFiles) {
      requirementFiles = updated.requirementFiles.slice();
      refreshRequirementFiles();
    }
  }

  function mergeDriveLinksInBackground(saved, syncResult) {
    const sheet = window.OwlisticSheet;
    const uploaded = (syncResult && syncResult.uploadedNames) || [];
    if (!sheet || !uploaded.length) return;
    const wait = typeof sheet.waitForDriveLinks === "function"
      ? sheet.waitForDriveLinks(saved, uploaded, { localIds: (syncResult && syncResult.uploadedLocalIds) || [] })
      : (typeof sheet.fetchOrder === "function" ? sheet.fetchOrder(saved) : Promise.resolve(null));
    wait.then(function (remote) {
      if (!remote || !remote.order) return;
      const existing = store.getOrder(saved.id) || saved;
      store.upsertOrder(mergeRemoteFileUrls(existing, remote.order));
    }).catch(function () {});
  }

  function writeOrderToSheet(saved) {
    const sheet = window.OwlisticSheet;
    if (!sheet || typeof sheet.sync !== "function") {
      showToast("Order " + saved.id + " saved locally. Connect Google Sheet to sync.");
      return Promise.resolve({ saved: saved, sheet: { skipped: true } });
    }
    const pendingFiles = sheet.filesNeedingDrive ? sheet.filesNeedingDrive(saved) : [];
    if (isSubmitting && submitBtn) {
      submitBtn.textContent = pendingFiles.length ? "Uploading images to Drive…" : "Saving to Google Sheet…";
    }
    return sheet.sync(saved, { skipUploads: !pendingFiles.length }).then(function (syncResult) {
      const live = store.getOrder((syncResult && syncResult.orderId) || saved.id) || saved;
      if (live && live.id) saved.id = live.id;
      applySavedOrder(live);
      if (syncResult && syncResult.skipped) {
        showToast("Order " + saved.id + " saved locally. Connect Google Sheet to sync.");
        return { saved: saved, sheet: syncResult };
      }
      if (syncResult && (syncResult.ok === false || syncResult.confirmed === false)) {
        return { saved: saved, sheet: syncResult, confirmed: false, sheetFailed: true };
      }
      if (!pendingFiles.length && syncResult) {
        syncResult.missingDriveFiles = [];
      }
      mergeDriveLinksInBackground(saved, syncResult);
      return {
        saved: saved,
        sheet: syncResult,
        confirmed: Boolean(syncResult && syncResult.confirmed),
        duplicate: false
      };
    }).catch(function () {
      showToast("Order " + (saved && saved.id ? saved.id : "") + " saved locally, but Google Sheet sync failed");
      return { saved: saved, sheetFailed: true, confirmed: false };
    });
  }

  function filesStillUploading() {
    return requirementFiles.some(function (file) {
      return file && file.id && !file.url;
    });
  }

  function doSaveOrder(silent) {
    if (!formHasFilledOrderData() && !(fileInput && fileInput.files && fileInput.files.length)) {
      return Promise.resolve({ empty: true });
    }
    const leftover = fileInput && fileInput.files && fileInput.files.length
      ? Array.from(fileInput.files)
      : [];
    const ready = leftover.length
      ? ingestRequirementFiles(leftover)
      : (filesStillUploading() ? ingestQueue : Promise.resolve());
    return ready.then(function () {
      if (!formHasFilledOrderData()) {
        return { empty: true };
      }
      const saved = store.upsertOrder(collectOrder());
      if (silent) {
        applySavedOrder(saved);
        return { saved: saved, silent: true };
      }
      if (submitBtn) {
        const sheet = window.OwlisticSheet;
        const pending = sheet && sheet.filesNeedingDrive ? sheet.filesNeedingDrive(saved) : [];
        submitBtn.textContent = pending.length ? "Uploading images to Drive…" : "Saving to Google Sheet…";
      }
      return writeOrderToSheet(saved);
    });
  }

  function saveOrder(silent) {
    const run = saveQueue.then(function () {
      return doSaveOrder(silent);
    }, function () {
      return doSaveOrder(silent);
    });
    saveQueue = run.then(function () {}, function () {});
    if (!silent) {
      activeSheetSave = run.then(function (result) {
        activeSheetSave = null;
        return result;
      }, function (err) {
        activeSheetSave = null;
        throw err;
      });
      return activeSheetSave;
    }
    return run;
  }

  function persistLocalOrder() {
    if (!formHasFilledOrderData()) return null;
    const saved = store.upsertOrder(collectOrder());
    document.getElementById("order-id").value = saved.id;
    editMeta.hidden = false;
    if (deleteOrderBtn) deleteOrderBtn.hidden = false;
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", "index.html?order=" + encodeURIComponent(saved.id));
    }
    return saved;
  }

  function missingDriveMessage(names) {
    const list = (names || []).filter(Boolean);
    if (!list.length) return "";
    if (list.length === 1) return list[0] + " is not in Google Drive. Re-attach it and click Save.";
    return list.length + " files are not in Google Drive. Re-attach them and click Save.";
  }

  function warnMissingDriveFiles(syncResult, order) {
    const names = (syncResult && syncResult.missingDriveFiles) ||
      (window.OwlisticSheet && window.OwlisticSheet.filesMissingDrive
        ? window.OwlisticSheet.filesMissingDrive(order).map(function (file) { return file.name; })
        : []);
    const message = missingDriveMessage(names);
    if (message) showToast(message, 8000);
    return names;
  }

  function retryMissingDriveUploads(order) {
    const sheet = window.OwlisticSheet;
    if (!sheet || typeof sheet.uploadOrderFiles !== "function") return;
    const target = order || collectOrder();
    const pending = sheet.filesNeedingDrive ? sheet.filesNeedingDrive(target) : [];
    const stranded = sheet.filesMissingDrive ? sheet.filesMissingDrive(target) : [];
    if (pending.length) {
      showToast("Uploading missing images to Drive…", 2500);
      sheet.uploadOrderFiles(target).then(function (results) {
        const ok = (results || []).filter(function (item) { return item && item.file && item.file.url; });
        if (ok.length) {
          persistLocalOrder();
          refreshRequirementFiles();
          renderMessageThread();
          renderRevisions();
          showToast(ok.length === 1 ? "Missing image saved to Drive." : ok.length + " missing images saved to Drive.");
        }
        const still = sheet.filesMissingDrive(collectOrder());
        if (still.length) warnMissingDriveFiles({ missingDriveFiles: still.map(function (file) { return file.name; }) }, collectOrder());
      }).catch(function () {});
      return;
    }
    if (stranded.length) warnMissingDriveFiles({ missingDriveFiles: stranded.map(function (file) { return file.name; }) }, target);
  }

  function uploadAttachedFiles(files) {
    const sheet = window.OwlisticSheet;
    const pending = (files || []).filter(function (file) {
      return file && file.id && !file.url;
    });
    if (!pending.length) return Promise.resolve([]);
    const saved = persistLocalOrder();
    const orderId = (saved && saved.id) || document.getElementById("order-id").value;
    if (!sheet || typeof sheet.uploadFile !== "function") {
      showToast("Image added on the form. Click Save to store it in Drive.", 4000);
      return Promise.resolve([]);
    }
    showToast("Image added. Uploading to Drive…", 2200);
    return pending.reduce(function (chain, file) {
      return chain.then(function (results) {
        return sheet.uploadFile(file, orderId).then(function (result) {
          results.push(result);
          return results;
        });
      });
    }, Promise.resolve([])).then(function (results) {
      const ok = results.filter(function (item) { return item && item.url; });
      const failed = results.filter(function (item) { return !item || !item.url; });
      if (ok.length) {
        persistLocalOrder();
        refreshRequirementFiles();
        renderMessageThread();
        renderRevisions();
        showToast(ok.length === 1 ? "Image saved to Drive." : ok.length + " images saved to Drive.");
      }
      if (failed.length) {
        const err = (failed[0] && (failed[0].error || failed[0].driveLastError)) || "Drive upload failed.";
        showToast("Could not save image to Drive: " + err, 7000);
      }
      restoreSaveButton();
      return results;
    }).catch(function (err) {
      restoreSaveButton();
      showToast("Could not save image to Drive: " + ((err && err.message) || "upload failed"), 7000);
    });
  }

  function restoreSaveButton() {
    if (isSubmitting) return;
    if (!submitBtn) return;
    submitBtn.disabled = false;
    submitBtn.textContent = "Save to Google Sheet";
  }

  function saveFilesToDrive() {
    return saveOrder(false).then(function (result) {
      restoreSaveButton();
      const saved = result && result.saved;
      const skipped = result && result.sheet && result.sheet.skippedLarge;
      if (skipped && skipped.length) {
        showToast("Some images were too large to upload to Drive (max 20 MB).", 5000);
      }
      const hasDriveLink = saved && orderHasDriveLinks(saved);
      const missing = result && result.sheet && result.sheet.missingDriveFiles;
      if (result && result.sheetFailed) {
        showToast("Image saved on the form. Click Save to Google Sheet to store it in Drive.", 4500);
      } else if (missing && missing.length) {
        warnMissingDriveFiles(result.sheet, saved);
      } else if (hasDriveLink) {
        showToast("Image saved to Drive. Anyone can download it.");
      }
      return result;
    }).catch(function (err) {
      restoreSaveButton();
      throw err;
    });
  }

  function orderHasDriveLinks(order) {
    function anyUrl(list) {
      return (list || []).some(function (file) { return file && file.url; });
    }
    if (!order) return false;
    if (anyUrl(order.requirementFiles)) return true;
    const threads = order.messageThread || [];
    for (let i = 0; i < threads.length; i += 1) {
      if (anyUrl(threads[i] && threads[i].files)) return true;
    }
    const rounds = order.revisions || [];
    for (let r = 0; r < rounds.length; r += 1) {
      const messages = (rounds[r] && rounds[r].messages) || [];
      for (let m = 0; m < messages.length; m += 1) {
        if (anyUrl(messages[m] && messages[m].files)) return true;
      }
    }
    return false;
  }

  function loadOrder(order) {
    document.getElementById("order-id").value = order.id;
    populateAccounts(order.accountId || "");
    document.getElementById("whatsapp").value = order.whatsapp || "";
    document.getElementById("name").value = order.name || "";
    if (boardStatusSelect) {
      const loaded = (store.boardStatusOf && store.boardStatusOf(order)) || order.boardStatus || "in-progress";
      boardStatusSelect.value = loaded;
    }
    document.getElementById("orderValue").value = order.orderValue || "";
    setPayment("paymentStatus", order.paymentStatus || "");
    document.getElementById("searchKeyword").value = order.searchKeyword || "";
    document.getElementById("order-custom").checked = Boolean(order.orderTypeCustom);
    document.getElementById("order-direct").checked = Boolean(order.orderTypeDirect);
    threadMessages = store.messageThreadOf ? store.messageThreadOf(order) : (order.messageThread || []).slice();
    if (!threadMessages.length) threadMessages = emptyMessageThread();
    document.getElementById("messageText").value = order.messageText || "";
    document.getElementById("directRequirements").value = order.directRequirements || "";
    document.getElementById("fiverrId").value = order.fiverrId || "";
    document.getElementById("fiverrGigUrl").value = order.fiverrGigUrl || "";
    growUrlFields();
    document.getElementById("reviewText").value = order.reviewText || "";
    requirementFiles = (order.requirementFiles || []).slice();
    revisions = store.normalizeRevisions(order.revisions || []);
    fileInput.value = "";
    submitBtn.textContent = "Save to Google Sheet";
    editMeta.hidden = false;
    if (deleteOrderBtn) deleteOrderBtn.hidden = false;
    editMeta.textContent = "Editing " + order.id + " · Created " + store.formatDateTime(order.createdAt) + " · Last updated " + store.formatDateTime(order.updatedAt);
    refreshRequirementFiles();
    renderMessageThread();
    renderRevisions();
    updateStatusUI();
    retryMissingDriveUploads();
  }

  function syncSavedAccountProfiles() {
    if (!isAdmin()) return;
    const sheet = window.OwlisticSheet;
    if (!sheet || typeof sheet.upsertUser !== "function") return;
    store.getAccounts().forEach(function (account) {
      if (!account || !account.username) return;
      if (!(account.whatsapp || account.personName || account.fiverrId || account.fiverrGigUrl || account.paymentStatus)) return;
      sheet.upsertUser({
        username: account.username,
        password: "",
        account: account.name,
        displayName: account.personName || account.name,
        personName: account.personName || "",
        whatsapp: account.whatsapp || "",
        fiverrId: account.fiverrId || "",
        fiverrGigUrl: account.fiverrGigUrl || "",
        paymentStatus: account.paymentStatus || ""
      }).catch(function () {});
    });
  }

  function loadAccountsFromSheet() {
    const sheet = window.OwlisticSheet;
    if (!sheet || typeof sheet.fetchAccounts !== "function") {
      return Promise.resolve(null);
    }
    return sheet.fetchAccounts().then(function (result) {
      populateAccounts(accountSelect && accountSelect.value);
      applyAccountIfNewOrder();
      return result;
    }).catch(function () {
      return null;
    });
  }

  function formOrderFromSheet(raw) {
    if (!raw) return null;
    const order = Object.assign({}, raw);
    const accounts = (store.getAccounts && store.getAccounts()) || [];
    const wanted = String(order.accountName || order.tabName || "").trim().toLowerCase();
    const match = accounts.find(function (account) {
      const name = String((account && account.name) || "").trim().toLowerCase();
      const label = String((store.accountLabel && store.accountLabel(account)) || "").trim().toLowerCase();
      return wanted && (name === wanted || label === wanted || (name && wanted.indexOf(name + " ") === 0));
    });
    if (match) order.accountId = match.id;
    if (typeof store.normalizeRevisions === "function") {
      order.revisions = store.normalizeRevisions(order.revisions || []);
    }
    if (typeof store.messageThreadOf === "function") {
      order.messageThread = store.messageThreadOf(order);
    }
    return order;
  }

  function openExistingOrder(orderId) {
    document.getElementById("order-id").value = orderId;
    const local = store.getOrder(orderId);
    if (local && !auth.canSeeOrder(local)) {
      showToast("You can only open orders for your account.");
      goToDefaultPage();
      return;
    }
    if (local && auth.canSeeOrder(local)) {
      loadOrder(local);
    }
    const sheet = window.OwlisticSheet;
    const session = auth.getSession && auth.getSession();
    const hint = local || {
      id: orderId,
      accountName: (session && session.account) || "",
      tabName: (session && session.account) || ""
    };
    const applyRemote = function (remote) {
      const raw = remote && remote.order;
      if (!raw) {
        if (local && auth.canSeeOrder(local)) {
          loadOrder(local);
          return;
        }
        showToast("This order was not found in the Google Sheet.");
        goToDefaultPage();
        return;
      }
      const order = formOrderFromSheet(raw);
      if (!auth.canSeeOrder(order)) {
        showToast("You can only open orders for your account.");
        goToDefaultPage();
        return;
      }
      loadOrder(order);
    };
    if (!sheet || typeof sheet.fetchOrder !== "function") {
      if (local && auth.canSeeOrder(local)) loadOrder(local);
      else {
        showToast("Could not load this order from the Google Sheet.");
        goToDefaultPage();
      }
      return;
    }
    sheet.fetchOrder(hint).then(applyRemote).catch(function () {
      if (local && auth.canSeeOrder(local)) loadOrder(local);
      else {
        showToast("Could not load this order from the Google Sheet.");
        goToDefaultPage();
      }
    });
  }

  function bootForm() {
    const existingId = new URLSearchParams(window.location.search).get("order");
    if (existingId) {
      document.getElementById("order-id").value = existingId;
    }
    populateAccounts();
    refreshRequirementFiles();
    if (!threadMessages.length) threadMessages = emptyMessageThread();
    renderMessageThread();
    renderRevisions();
    updateStatusUI();

    if (existingId) {
      openExistingOrder(existingId);
    } else {
      applyAccount(lockedAccount());
      [200, 800].forEach(function (ms) {
        window.setTimeout(applyAccountIfNewOrder, ms);
      });
    }
    growUrlFields();
  }

  (function startForm() {
    const sheet = window.OwlisticSheet;
    const ordersPromise = sheet && typeof sheet.fetchOrders === "function"
      ? sheet.fetchOrders()
      : Promise.resolve(null);
    const profilePromise = auth.fetchUserProfile
      ? auth.fetchUserProfile()
      : Promise.resolve(null);
    const accountsPromise = sheet && typeof sheet.fetchAccounts === "function"
      ? sheet.fetchAccounts()
      : Promise.resolve(null);
    Promise.all([ordersPromise, profilePromise, accountsPromise]).then(function (parts) {
      const result = parts[0];
      if (result && result.ok && typeof store.replaceOrders === "function") {
        store.replaceOrders(result.orders || []);
      } else if (result && result.orders && result.orders.length) {
        store.importOrders(result.orders);
      }
      bootForm();
      syncSavedAccountProfiles();
    }).catch(function () {
      bootForm();
      syncSavedAccountProfiles();
    });
  })();

  accountSelect.addEventListener("change", function () {
    const selected = store.getAccount(accountSelect.value);
    applyAccount(selected);
    if (selected) refreshAccountFromSheet(selected.name || selected.username);
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
    const name = document.getElementById("account-name").value.trim();
    if (!name) {
      showToast("Account Name is required.");
      document.getElementById("account-name").focus();
      return;
    }
    const username = document.getElementById("account-username").value.trim();
    const password = document.getElementById("account-username-password").value;
    const payload = {
      id: document.getElementById("account-edit-id").value || undefined,
      name: name,
      whatsapp: document.getElementById("account-whatsapp").value.trim(),
      personName: document.getElementById("account-person-name").value.trim(),
      paymentStatus: selectedPayment("accountPaymentStatus"),
      fiverrId: document.getElementById("account-fiverr-id").value.trim(),
      fiverrGigUrl: document.getElementById("account-fiverr-url").value.trim()
    };
    if (username) payload.username = username;
    const saved = store.upsertAccount(payload);
    populateAccounts(saved.id);
    applyAccount(saved);
    fillAccountEditor(saved);
    renderAccountList();
    syncAccountTabs("Account saved. Sheet tab created.");
    if ((username || saved.username) && window.OwlisticSheet && typeof window.OwlisticSheet.upsertUser === "function") {
      window.OwlisticSheet.upsertUser({
        username: username || saved.username,
        password: password,
        account: saved.name,
        displayName: saved.personName || saved.name,
        personName: saved.personName || "",
        whatsapp: saved.whatsapp || "",
        fiverrId: saved.fiverrId || "",
        fiverrGigUrl: saved.fiverrGigUrl || "",
        paymentStatus: saved.paymentStatus || ""
      }).then(function (result) {
        if (result && result.ok === false) {
          showToast(result.error || "Account saved. Login user was not stored.");
        }
        return loadAccountsFromSheet();
      }).catch(function () {
        showToast("Account saved. Login user was not stored.");
      });
    } else {
      loadAccountsFromSheet();
    }
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

  function fileAlreadyAttached(file) {
    const name = file && file.name;
    const size = file && Number(file.size || 0);
    if (!name) return false;
    return requirementFiles.some(function (item) {
      return item && item.name === name && Number(item.size || 0) === size;
    });
  }

  function ingestRequirementFiles(fileList) {
    const files = Array.from(fileList || []).filter(function (file) {
      return file && !fileAlreadyAttached(file);
    });
    if (fileInput) fileInput.value = "";
    if (!files.length) {
      refreshRequirementFiles();
      return ingestQueue;
    }
    const task = ingestQueue.then(function () {
      return store.saveFileBlobs(files).then(function (saved) {
        requirementFiles = requirementFiles.concat(saved);
        refreshRequirementFiles();
        return uploadAttachedFiles(saved);
      });
    }).catch(function () {
      refreshRequirementFiles();
    });
    ingestQueue = task.then(function () {}, function () {});
    return task;
  }

  fileInput.addEventListener("change", function () {
    ingestRequirementFiles(fileInput.files);
  });
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
    ingestRequirementFiles(files);
  });

  if (messageThreadEl) {
    messageThreadEl.addEventListener("click", function (event) {
      const editBtn = event.target.closest("[data-mt-edit]");
      if (editBtn) {
        const field = messageThreadEl.querySelector('[data-mt-text="' + editBtn.getAttribute("data-mt-edit") + '"]');
        const card = event.target.closest("[data-mt-card]");
        messageThreadEl.querySelectorAll(".chat-bubble.is-editing").forEach(function (el) {
          el.classList.remove("is-editing");
        });
        if (card) card.classList.add("is-editing");
        if (field) {
          field.focus();
          field.setSelectionRange(field.value.length, field.value.length);
        }
        return;
      }

      const deleteRowBtn = event.target.closest("[data-mt-delete-row]");
      if (deleteRowBtn) {
        removeThreadPair(Number(deleteRowBtn.getAttribute("data-mt-delete-row")));
        renderMessageThread();
        maybePersist();
        showToast("Row deleted");
        return;
      }

      const deleteMessageBtn = event.target.closest("[data-mt-delete]");
      if (deleteMessageBtn) {
        removeThreadMessage(deleteMessageBtn.getAttribute("data-mt-delete"));
        renderMessageThread();
        maybePersist();
        showToast("Message deleted");
        return;
      }

      const nextRow = event.target.closest("[data-mt-next]");
      const addBtn = nextRow || event.target.closest("[data-mt-add]");
      if (!addBtn) return;
      const role = nextRow ? "buyer" : addBtn.getAttribute("data-mt-add");
      if (!canAddThread(role)) {
        showToast(threadHint(role));
        return;
      }
      addThreadMessage(role);
      renderMessageThread();
      maybePersist();
    });

    messageThreadEl.addEventListener("change", function (event) {
      const filesInput = event.target.closest("[data-mt-files]");
      if (!filesInput || !filesInput.files || !filesInput.files.length) return;
      const message = findThreadMessage(filesInput.getAttribute("data-mt-files"));
      if (!message) return;
      store.saveFileBlobs(filesInput.files).then(function (saved) {
        message.files = (message.files || []).concat(saved);
        filesInput.value = "";
        renderMessageThread();
        return uploadAttachedFiles(saved);
      });
    });

    messageThreadEl.addEventListener("input", function (event) {
      const field = event.target.closest("[data-mt-text]");
      if (!field) return;
      const message = findThreadMessage(field.getAttribute("data-mt-text"));
      if (message) message.text = field.value;
      updateThreadActionButtons();
      maybePersist();
    });
  }

  document.getElementById("add-revision").addEventListener("click", function () {
    const revision = {
      id: store.uid("rev"),
      number: revisions.length + 1,
      createdAt: store.nowIso(),
      completed: false,
      messages: []
    };
    addMessage(revision, "buyer");
    revisions.push(revision);
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
      removeRevision(deleteRowBtn.getAttribute("data-revision-id"));
      renderRevisions();
      maybePersist();
      showToast("Revision deleted");
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
    if (nextRow) {
      if (!canStartNextRevision()) {
        const last = revisions[revisions.length - 1];
        showToast(last ? addHint(last, "seller") : "Add Revision 1 first");
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
      renderRevisions();
      maybePersist();
      return;
    }
    const button = event.target.closest("[data-add-message]");
    if (!button) return;
    const revision = findRevision(button.getAttribute("data-revision-id"));
    if (!revision) return;
    const role = button.getAttribute("data-add-message");
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
      return uploadAttachedFiles(saved);
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
    if (box.checked && revisions.length && revisions.every(function (item) { return item.completed; })) {
      showToast("All revisions complete. Set status to Ready to Approve when it is ready.");
    } else if (box.checked) {
      showToast("Revision completed");
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

  if (boardStatusSelect) {
    boardStatusSelect.addEventListener("change", function () {
      updateStatusUI();
      maybePersist();
    });
  }

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

  urlFields.forEach(function (el) {
    el.addEventListener("input", function () {
      growUrlField(el);
    });
    el.addEventListener("paste", function () {
      window.setTimeout(function () {
        growUrlField(el);
      }, 0);
    });
  });

  document.getElementById("copy-sheet-script").addEventListener("click", function () {
    const copy = function (source) {
      if (!source) {
        showToast("Could not load Apps Script file. Open apps-script/Code.gs from the project folder.");
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(source).then(function () {
          showToast("Script copied. In your sheet: Extensions → Apps Script → paste → Deploy → New version");
        });
      }
    };
    if (window.OwlisticSheet && typeof window.OwlisticSheet.loadScriptSource === "function") {
      window.OwlisticSheet.loadScriptSource().then(copy);
      return;
    }
    copy(window.OwlisticSheet.scriptSource || "");
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
    if (!formHasFilledOrderData()) {
      showToast("The form is empty. Fill in the order details before saving.", 4000);
      return;
    }
    isSubmitting = true;
    window.clearTimeout(persistTimer);
    persistTimer = null;
    submitBtn.disabled = true;
    const sheet = window.OwlisticSheet;
    const pendingNow = sheet && sheet.filesNeedingDrive
      ? sheet.filesNeedingDrive(collectOrder())
      : [];
    submitBtn.textContent = (pendingNow.length || filesStillUploading())
      ? "Uploading images to Drive…"
      : "Saving to Google Sheet…";
    saveOrder(false).then(function (outcome) {
      if (!outcome || outcome.empty || (outcome.sheet && outcome.sheet.skipped)) {
        if (outcome && outcome.empty) {
          showToast("The form is empty. Fill in the order details before saving.", 4000);
        }
        return;
      }
      if (outcome.confirmed) {
        goToDefaultPage();
        showToast("Order is filled in the Google Sheet.", 5000);
        return;
      }
      showToast("Could not save this order to the Google Sheet. Check the sheet and try Save again.", 5000);
    }).catch(function () {
      showToast("Could not save this order");
    }).then(function () {
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Save to Google Sheet";
    });
  });
})();
