(function (global) {
  const store = global.OwlisticStore;
  let deps = {};
  let activeOrderId = "";
  let activeRevisionNumber = 0;
  let modalState = null;
  let pendingFiles = [];
  let modalSaving = false;
  let pendingStatusChange = null;

  function el(id) { return document.getElementById(id); }

  function newSubId() {
    return "sub_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function formatStamp(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
      ", " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function subLabel(parentNumber, subNumber) {
    return "R" + parentNumber + " - Sub Revision " + subNumber;
  }

  function mainStatusChipLabel(step) {
    if (!step) return "PENDING";
    if (step.state === "completed") return "COMPLETED";
    if (step.state === "current") return "OPEN";
    return "PENDING";
  }

  function subStatusLabel(sub) {
    if (!sub) return "Pending";
    if (sub.completed || sub.status === "completed") return "Completed";
    if (sub.status === "active") return "Latest";
    return "Pending";
  }

  function partitionSubs(subs) {
    if (store && typeof store.partitionSubRevisions === "function") {
      return store.partitionSubRevisions(subs);
    }
    const list = (subs || []).slice();
    const completed = list.filter(function (item) { return item.completed; })
      .sort(function (a, b) { return (b.subRevisionNumber || 0) - (a.subRevisionNumber || 0); });
    const current = list.find(function (item) { return !item.completed && item.status === "active"; }) || null;
    const pending = list.filter(function (item) {
      return !item.completed && item.status !== "active";
    }).sort(function (a, b) { return (a.subRevisionNumber || 0) - (b.subRevisionNumber || 0); });
    return { current: current, pending: pending, completed: completed };
  }

  function attachmentThumb(att) {
    const src = att.thumbnailUrl || att.imageUrl || att.url || att.previewUrl || "";
    const name = att.fileName || att.name || "image";
    if (!src && att.id) {
      return '<button type="button" class="rev-sub-thumb" data-preview-attachment="' + deps.escapeHtml(att.id) + '" title="' + deps.escapeHtml(name) + '">' +
        '<img src="" alt="' + deps.escapeHtml(name) + '" class="chat-thumb" data-local-file-id="' + deps.escapeHtml(att.id) + '" loading="lazy" />' +
      "</button>";
    }
    if (!src) return "";
    return '<button type="button" class="rev-sub-thumb" data-preview-attachment="' + deps.escapeHtml(att.id || name) + '" title="' + deps.escapeHtml(name) + '">' +
      '<img src="' + deps.escapeHtml(src) + '" alt="' + deps.escapeHtml(name) + '" class="chat-thumb" loading="lazy" />' +
    "</button>";
  }

  function attachmentsRow(attachments, revisionId, subId) {
    const list = (attachments || []).filter(function (att) {
      return att && (att.imageUrl || att.url || att.thumbnailUrl || att.id);
    });
    if (!list.length) return "";
    return '<div class="rev-sub-attachments" data-revision-id="' + deps.escapeHtml(revisionId) + '" data-sub-id="' + deps.escapeHtml(subId) + '">' +
      list.map(function (att) { return attachmentThumb(att); }).join("") +
    "</div>";
  }

  function mainRevisionText(round, role) {
    const wanted = role === "seller" ? "seller" : "buyer";
    const messages = (round && round.messages) || [];
    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      const msgRole = msg && (msg.role === "seller" || msg.kind === "seller") ? "seller" : "buyer";
      if (msgRole === wanted && String(msg.text || "").trim()) return String(msg.text).trim();
    }
    return "";
  }

  function renderStatusChip(state, label) {
    return '<span class="rev-history-status is-' + state + '">' + deps.escapeHtml(label) + "</span>";
  }

  function renderMainStatusControl(step, order) {
    const canEdit = deps.canEditOrder(order);
    const isCurrent = step.state === "current";
    if (!canEdit || !isCurrent) {
      return renderStatusChip(step.state, mainStatusChipLabel(step));
    }
    const value = "open";
    return '<div class="rev-sub-status-wrap" data-status-wrap="main">' +
      '<select class="rev-sub-status-select rev-history-status is-current" data-main-revision-status ' +
        'data-revision-id="' + deps.escapeHtml(step.round.id) + '" ' +
        'data-revision-number="' + step.number + '" ' +
        'data-previous-value="' + value + '" ' +
        'aria-label="Main revision status">' +
        '<option value="open" selected>Open</option>' +
        '<option value="completed">Completed</option>' +
      "</select>" +
      '<span class="rev-sub-status-saving" hidden>Saving...</span>' +
      '<button type="button" class="rev-sub-status-retry" hidden>Save failed — Retry</button>' +
    "</div>";
  }

  function renderSubStatusControl(sub, step, order, editable) {
    const label = subStatusLabel(sub);
    const state = sub.completed ? "completed" : (sub.status === "active" ? "current" : "pending");
    if (!editable || sub.completed) {
      return renderStatusChip(state, label.toUpperCase());
    }
    const value = sub.status || "active";
    return '<div class="rev-sub-status-wrap" data-status-wrap="sub">' +
      '<select class="rev-sub-status-select rev-history-status is-' + state + '" data-sub-revision-status ' +
        'data-revision-id="' + deps.escapeHtml(step.round.id) + '" ' +
        'data-sub-id="' + deps.escapeHtml(sub.id) + '" ' +
        'data-revision-number="' + step.number + '" ' +
        'data-previous-value="' + deps.escapeHtml(value) + '" ' +
        'aria-label="Sub revision status">' +
        '<option value="active"' + (value === "active" ? " selected" : "") + ">Latest</option>" +
        '<option value="pending"' + (value === "pending" ? " selected" : "") + ">Pending</option>" +
        '<option value="completed"' + (value === "completed" ? " selected" : "") + ">Completed</option>" +
      "</select>" +
      '<span class="rev-sub-status-saving" hidden>Saving...</span>' +
      '<button type="button" class="rev-sub-status-retry" hidden>Save failed — Retry</button>' +
    "</div>";
  }

  function renderMainCard(step, order) {
    const round = step.round;
    const buyer = mainRevisionText(round, "buyer");
    const seller = mainRevisionText(round, "seller");
    const canEdit = deps.canEditOrder(order);
    return '<article class="rev-sub-main-card">' +
      '<header class="rev-sub-card-head">' +
        "<h4>Main Revision " + step.number + "</h4>" +
        renderMainStatusControl(step, order) +
      "</header>" +
      '<p class="rev-sub-line"><span>Buyer Revision</span> ' + deps.escapeHtml(buyer || "—") + "</p>" +
      '<p class="rev-sub-line"><span>Seller Reply</span> ' + deps.escapeHtml(seller || "—") + "</p>" +
      '<p class="rev-sub-meta">Updated: ' + deps.escapeHtml(formatStamp(round.updatedAt || round.createdAt)) + "</p>" +
      (canEdit
        ? '<button type="button" class="ghost-btn rev-sub-edit-btn" data-edit-main-revision="' + deps.escapeHtml(round.id) + '">Edit</button>'
        : "") +
    "</article>";
  }

  function renderSubCardBody(sub, step, order, options) {
    const opts = options || {};
    const canEdit = deps.canEditOrder(order);
    const editableStatus = Boolean(opts.editableStatus);
    const quiet = Boolean(opts.quiet);
    return '<article class="rev-sub-card' + (sub.completed || quiet ? " is-completed" : "") + (quiet ? " is-quiet" : "") + '">' +
      '<header class="rev-sub-card-head">' +
        "<h4>" + deps.escapeHtml(subLabel(step.number, sub.subRevisionNumber)) + "</h4>" +
        renderSubStatusControl(sub, step, order, editableStatus) +
      "</header>" +
      '<p class="rev-sub-line"><span>Buyer Revision</span> ' + deps.escapeHtml(sub.buyerRevision || "—") + "</p>" +
      '<p class="rev-sub-line"><span>Seller Reply</span> ' + deps.escapeHtml(sub.sellerReply || "—") + "</p>" +
      attachmentsRow(sub.attachments, step.round.id, sub.id) +
      '<p class="rev-sub-meta">Updated: ' + deps.escapeHtml(formatStamp(sub.updatedAt || sub.createdAt)) + "</p>" +
      '<div class="rev-sub-actions">' +
        (canEdit ? '<button type="button" class="ghost-btn rev-sub-edit-btn" data-edit-sub-revision="' + deps.escapeHtml(step.round.id) + '" data-sub-id="' + deps.escapeHtml(sub.id) + '">Edit</button>' : "") +
        (canEdit ? '<button type="button" class="ghost-btn is-danger rev-sub-delete-btn" data-delete-sub-revision="' + deps.escapeHtml(step.round.id) + '" data-sub-id="' + deps.escapeHtml(sub.id) + '" data-revision-number="' + step.number + '">Delete</button>' : "") +
      "</div>" +
    "</article>";
  }

  function subsForRound(round) {
    const parentNumber = Number(round && round.number) || 0;
    return (round && round.subRevisions || []).filter(function (sub) {
      if (!sub) return false;
      const parent = Number(sub.parentRevisionNumber || parentNumber);
      return parent === parentNumber;
    });
  }

  function renderSubSectionsForStep(step, order) {
    const canEdit = deps.canEditOrder(order);
    const isCurrent = step.state === "current";
    const partition = partitionSubs(subsForRound(step.round));
    let subHtml = "";
    if (isCurrent) {
      subHtml += renderCurrentSubSection(partition.current, step, order);
      subHtml += renderPendingSubSection(partition.pending, step, order);
      if (canEdit) {
        subHtml += '<button type="button" class="ghost-btn rev-sub-add-btn" data-add-sub-revision="' + deps.escapeHtml(step.round.id) + '">+ Add Sub Revision</button>';
      }
      subHtml += renderCompletedSubSection(partition.completed, step, order);
      return subHtml;
    }
    return renderHistoricalSubs(step, order);
  }

  function renderRevisionBlock(step, order) {
    const activeClass = step.number === activeRevisionNumber ? " is-active-block" : "";
    return '<section class="rev-sub-block' + activeClass + '" data-rev-block="' + step.number + '">' +
      renderMainCard(step, order) +
      '<div class="rev-sub-tree">' + renderSubSectionsForStep(step, order) + "</div>" +
    "</section>";
  }

  function renderCurrentSubSection(current, step, order) {
    if (!current) return "";
    return '<div class="rev-sub-section">' +
      '<p class="rev-sub-section-label">Latest Sub Revision</p>' +
      renderSubCardBody(current, step, order, { editableStatus: true }) +
    "</div>";
  }

  function renderPendingSubSection(pending, step, order) {
    if (!pending.length) return "";
    return '<div class="rev-sub-section is-pending-section">' +
      '<p class="rev-sub-section-label is-quiet">Pending Sub Revisions</p>' +
      '<div class="rev-sub-pending-list">' +
        pending.map(function (sub) {
          return renderSubCardBody(sub, step, order, { editableStatus: false, quiet: true });
        }).join("") +
      "</div>" +
    "</div>";
  }

  function renderCompletedSubSection(completed, step, order) {
    if (!completed.length) return "";
    return '<div class="rev-sub-section is-completed-section">' +
      '<p class="rev-sub-section-label is-quiet">Completed Sub Revisions</p>' +
      '<div class="rev-sub-completed-list">' +
        completed.map(function (sub) {
          return renderSubCardBody(sub, step, order, { editableStatus: false, quiet: true });
        }).join("") +
      "</div>" +
    "</div>";
  }

  function renderHistoricalSubs(step, order) {
    const subs = subsForRound(step.round).slice().sort(function (a, b) {
      return (b.subRevisionNumber || 0) - (a.subRevisionNumber || 0);
    });
    if (!subs.length) return "";
    return '<div class="rev-sub-section is-completed-section">' +
      '<p class="rev-sub-section-label is-quiet">Sub Revisions</p>' +
      '<div class="rev-sub-completed-list">' +
        subs.map(function (sub) {
          return renderSubCardBody(sub, step, order, { editableStatus: false, quiet: true });
        }).join("") +
      "</div>" +
    "</div>";
  }

  function renderDrawerBody(order, steps) {
    const currentStep = steps.find(function (step) { return step.state === "current"; }) || null;
    if (!activeRevisionNumber && currentStep) activeRevisionNumber = currentStep.number;
    const selected = steps.find(function (step) { return step.number === activeRevisionNumber; }) ||
      currentStep ||
      steps[steps.length - 1];
    if (!selected) return '<p class="live-chat-empty">No revisions on this order yet.</p>';
    return '<div class="rev-sub-tabs" role="tablist">' +
      steps.map(function (step) {
        const active = step.number === selected.number ? " is-active" : "";
        return '<button type="button" class="rev-sub-tab' + active + '" data-rev-tab="' + step.number + '" role="tab">' +
          "Revision " + step.number +
          '<span class="rev-sub-tab-badge is-' + step.state + '">' + mainStatusChipLabel(step) + "</span>" +
        "</button>";
      }).join("") +
    "</div>" +
    '<div class="rev-sub-stack">' +
      renderRevisionBlock(selected, order) +
    "</div>";
  }

  function renderDrawer(order) {
    const drawer = el("rev-history-drawer");
    const body = el("rev-history-body");
    const title = el("rev-history-title");
    const sub = el("rev-history-sub");
    if (!order || !drawer || !body) return;
    const steps = deps.revisionStepStates(deps.revisionRounds(order));
    if (!activeRevisionNumber && steps.length) {
      const current = steps.find(function (step) { return step.state === "current"; });
      activeRevisionNumber = current ? current.number : steps[steps.length - 1].number;
    }
    if (title) title.textContent = order.id;
    if (sub) {
      const who = order.clientName || order.name || "Client";
      sub.textContent = who + " · " + steps.length + (steps.length === 1 ? " revision" : " revisions");
    }
    body.innerHTML = renderDrawerBody(order, steps);
    drawer.hidden = false;
    document.body.classList.add("modal-open");
    if (deps.hydrateLocalThumbs) deps.hydrateLocalThumbs(body);
  }

  function openDrawer(orderId) {
    activeOrderId = orderId;
    const order = store.getOrder(orderId);
    if (!order) return;
    activeRevisionNumber = 0;
    deps.closeChat && deps.closeChat();
    deps.closeCompletePop && deps.closeCompletePop();
    renderDrawer(order);
  }

  function closeDrawer() {
    activeOrderId = "";
    const drawer = el("rev-history-drawer");
    if (drawer) drawer.hidden = true;
    if (!el("chat-drawer") || el("chat-drawer").hidden) document.body.classList.remove("modal-open");
  }

  function setModalStatus(text) {
    const node = el("rev-sub-modal-status");
    if (node) {
      node.textContent = text || "";
      node.hidden = !text;
    }
  }

  function renderModalPreview() {
    const preview = el("rev-sub-file-preview");
    if (!preview) return;
    preview.innerHTML = pendingFiles.map(function (file, index) {
      const src = file.previewUrl || file.url || (file.pendingBlob ? URL.createObjectURL(file.pendingBlob) : "");
      return '<figure class="rev-sub-file-chip">' +
        (src ? '<img src="' + deps.escapeHtml(src) + '" alt="" />' : "<span>IMG</span>") +
        '<button type="button" class="rev-sub-file-remove" data-remove-pending="' + index + '" aria-label="Remove image">×</button>' +
      "</figure>";
    }).join("");
  }

  function openModal(mode, order, revisionId, subRevision, revisionNumber) {
    const pendingSubId = mode === "add-sub" ? newSubId() : "";
    modalState = {
      mode: mode,
      orderId: order.id,
      revisionId: revisionId,
      revisionNumber: revisionNumber || activeRevisionNumber || 0,
      subId: subRevision && subRevision.id,
      pendingSubId: pendingSubId
    };
    pendingFiles = (subRevision && subRevision.attachments ? subRevision.attachments.slice() : []);
    const modal = el("rev-sub-modal");
    const title = el("rev-sub-modal-title");
    const buyer = el("rev-sub-buyer");
    const seller = el("rev-sub-seller");
    const status = el("rev-sub-status");
    if (!modal) return;
    if (title) title.textContent = mode === "edit-main" ? "Edit Main Revision" : (mode === "edit-sub" ? "Edit Sub Revision" : "Add Sub Revision");
    if (buyer) buyer.value = mode === "edit-main" ? mainRevisionText(deps.findRevisionRound(order, revisionId), "buyer") : (subRevision && subRevision.buyerRevision) || "";
    if (seller) seller.value = mode === "edit-main" ? mainRevisionText(deps.findRevisionRound(order, revisionId), "seller") : (subRevision && subRevision.sellerReply) || "";
    if (status) status.value = (subRevision && subRevision.status) || "active";
    if (status && status.closest("label")) {
      status.closest("label").hidden = mode === "edit-main" || mode === "add-sub";
    }
    renderModalPreview();
    setModalStatus("");
    const saveBtn = el("rev-sub-save");
    if (saveBtn) saveBtn.disabled = false;
    modalSaving = false;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    modalState = null;
    pendingFiles = [];
    modalSaving = false;
    const saveBtn = el("rev-sub-save");
    if (saveBtn) saveBtn.disabled = false;
    const modal = el("rev-sub-modal");
    if (modal) modal.hidden = true;
    setModalStatus("");
    if (el("rev-history-drawer") && !el("rev-history-drawer").hidden) return;
    if (el("chat-drawer") && !el("chat-drawer").hidden) return;
    document.body.classList.remove("modal-open");
  }

  function syncOrderInBackground(order, options) {
    const sheet = global.OwlisticSheet;
    if (!sheet) return Promise.resolve({ ok: true });
    const uploads = (options && options.syncOptions && options.syncOptions.skipUploads)
      ? Promise.resolve({ ok: true })
      : (typeof sheet.sync === "function" ? sheet.sync(order, options && options.syncOptions) : Promise.resolve({ ok: true }));
    const revisions = typeof sheet.syncRevisionsData === "function"
      ? sheet.syncRevisionsData(order)
      : Promise.resolve({ ok: true });
    return Promise.all([uploads, revisions]).then(function (results) {
      const revisionResult = results[1] || {};
      const uploadResult = results[0] || {};
      if ((revisionResult.ok === false || uploadResult.ok === false) && deps.showToast) {
        deps.showToast("Saved here, but Google Sheet sync failed. Try again.");
      }
      return revisionResult.ok === false ? revisionResult : uploadResult;
    }).catch(function () {
      if (deps.showToast) deps.showToast("Saved here, but Google Sheet sync failed. Try again.");
      return { ok: false };
    });
  }

  function persistOrder(order, options) {
    order.updatedAt = new Date().toISOString();
    store.upsertOrder(order);
    const fresh = store.getOrder(order.id) || order;
    if (!(options && options.skipCloseModal)) closeModal();
    renderDrawer(fresh);
    if (deps.render) deps.render();
    if (options && options.successMessage && deps.showToast) deps.showToast(options.successMessage);
    return syncOrderInBackground(fresh, options);
  }

  function buildAttachmentsFromPending() {
    return pendingFiles.map(function (file) {
      const fileName = file.fileName || file.name || "image";
      return {
        id: file.id || ("att_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
        name: fileName,
        driveFileId: file.driveFileId || file.driveId || "",
        fileName: fileName,
        mimeType: file.mimeType || file.type || "",
        type: file.mimeType || file.type || "",
        fileSize: file.fileSize || file.size || 0,
        size: file.fileSize || file.size || 0,
        imageUrl: file.imageUrl || file.url || "",
        thumbnailUrl: file.thumbnailUrl || file.previewUrl || file.imageUrl || "",
        uploadedAt: file.uploadedAt || ""
      };
    });
  }

  function applyModalSave(order) {
    const buyer = (el("rev-sub-buyer") && el("rev-sub-buyer").value) || "";
    const seller = (el("rev-sub-seller") && el("rev-sub-seller").value) || "";
    const status = (el("rev-sub-status") && el("rev-sub-status").value) || "active";
    const attachments = buildAttachmentsFromPending();
    const revisionNumber = modalState && modalState.revisionNumber;
    let saved = false;
    if (modalState.mode === "edit-main") {
      saved = store.setMainRevisionMessages(order, modalState.revisionId, buyer, seller, revisionNumber);
    } else if (modalState.mode === "edit-sub") {
      saved = store.updateSubRevision(order, modalState.revisionId, modalState.subId, {
        buyerRevision: buyer,
        sellerReply: seller,
        attachments: attachments
      }, revisionNumber);
      if (saved && typeof store.setSubRevisionStatus === "function") {
        saved = store.setSubRevisionStatus(order, modalState.revisionId, modalState.subId, status, revisionNumber);
      }
    } else {
      saved = store.addSubRevision(order, modalState.revisionId, {
        id: modalState.pendingSubId,
        buyerRevision: buyer,
        sellerReply: seller,
        attachments: attachments
      }, revisionNumber);
    }
    return saved;
  }

  function saveModal() {
    if (!modalState || modalSaving) return;
    if (!store || typeof store.getOrder !== "function") {
      if (deps.showToast) deps.showToast("Order storage is not ready. Refresh the page.");
      return;
    }
    const order = store.getOrder(modalState.orderId);
    if (!order) {
      if (deps.showToast) deps.showToast("Order not found. Refresh and try again.");
      return;
    }
    const saveBtn = el("rev-sub-save");
    modalSaving = true;
    if (saveBtn) saveBtn.disabled = true;
    setModalStatus("Saving revision...");
    let saved = false;
    try {
      saved = applyModalSave(order);
    } catch (err) {
      setModalStatus("");
      if (deps.showToast) deps.showToast("Could not save revision. Refresh and try again.");
      if (saveBtn) saveBtn.disabled = false;
      modalSaving = false;
      return;
    }
    if (!saved) {
      setModalStatus("");
      if (deps.showToast) deps.showToast("Could not find the selected revision. Close and reopen revision history.");
      if (saveBtn) saveBtn.disabled = false;
      modalSaving = false;
      return;
    }
    const needsUpload = buildAttachmentsFromPending().some(function (att) {
      return att.id && !att.imageUrl;
    });
    let successMessage = needsUpload ? "Revision saved. Uploading images..." : "Revision saved.";
    if (modalState.mode === "add-sub") {
      let round = store.findRevisionRound(order, modalState.revisionId);
      if (!round && modalState.revisionNumber && store.normalizeRevisions) {
        round = store.normalizeRevisions(order.revisions || []).find(function (item) {
          return Number(item.number) === Number(modalState.revisionNumber);
        }) || null;
      }
      const added = round && (round.subRevisions || []).find(function (sub) {
        return String(sub.id) === String(modalState.pendingSubId);
      });
      if (added && added.status === "pending") {
        successMessage = "Sub Revision " + added.subRevisionNumber + " saved. It will become latest when the current sub revision is completed.";
      } else if (added) {
        successMessage = "Sub Revision " + added.subRevisionNumber + " saved.";
      }
    }
    persistOrder(order, {
      successMessage: successMessage,
      syncOptions: { skipUploads: false }
    }).finally(function () {
      setModalStatus("");
      if (saveBtn) saveBtn.disabled = false;
      modalSaving = false;
    });
  }

  function setStatusWrapState(wrap, state) {
    if (!wrap) return;
    const select = wrap.querySelector("select");
    const saving = wrap.querySelector(".rev-sub-status-saving");
    const retry = wrap.querySelector(".rev-sub-status-retry");
    if (select) select.disabled = state === "saving";
    if (saving) saving.hidden = state !== "saving";
    if (retry) retry.hidden = state !== "failed";
    wrap.classList.toggle("is-saving", state === "saving");
    wrap.classList.toggle("is-failed", state === "failed");
  }

  function rollbackOrder(snapshot) {
    if (!snapshot) return;
    store.upsertOrder(snapshot);
  }

  function handleMainStatusChange(select, retrying) {
    const order = store.getOrder(activeOrderId);
    if (!order || !select) return;
    const revisionId = select.getAttribute("data-revision-id");
    const revisionNumber = Number(select.getAttribute("data-revision-number")) || 0;
    const previousValue = select.getAttribute("data-previous-value") || "open";
    const newValue = select.value;
    if (!retrying && newValue === previousValue) return;
    const snapshot = JSON.parse(JSON.stringify(order));
    const wrap = select.closest(".rev-sub-status-wrap");
    setStatusWrapState(wrap, "saving");
    let saved = false;
    if (typeof store.setMainRevisionStatus === "function") {
      saved = store.setMainRevisionStatus(order, revisionId, newValue, revisionNumber);
    } else {
      saved = store.setRevisionCompleted(order, revisionId, newValue === "completed", revisionNumber);
    }
    if (!saved) {
      select.value = previousValue;
      setStatusWrapState(wrap, "idle");
      if (deps.showToast) deps.showToast("Complete previous revisions first.");
      return;
    }
    pendingStatusChange = { type: "main", select: select, snapshot: snapshot, previousValue: previousValue };
    store.upsertOrder(order);
    syncOrderInBackground(order, { syncOptions: { skipUploads: true } }).then(function (result) {
      if (result && result.ok === false) {
        rollbackOrder(snapshot);
        select.value = previousValue;
        setStatusWrapState(wrap, "failed");
        return;
      }
      select.setAttribute("data-previous-value", newValue);
      setStatusWrapState(wrap, "idle");
      pendingStatusChange = null;
      const fresh = store.getOrder(activeOrderId);
      if (fresh) {
        if (newValue === "completed") {
          const steps = deps.revisionStepStates(deps.revisionRounds(fresh));
          const next = steps.find(function (step) { return step.state === "current"; });
          if (next) activeRevisionNumber = next.number;
        }
        renderDrawer(fresh);
        if (deps.render) deps.render();
      }
    });
  }

  function handleDeleteSubRevision(revisionId, subId, revisionNumber) {
    const order = store.getOrder(activeOrderId);
    if (!order || !revisionId || !subId) return;
    if (!deps.canEditOrder(order)) return;
    const round = store.findRevisionRound(order, revisionId);
    const sub = store.findSubRevisionRound(order, revisionId, subId);
    if (!round || !sub) {
      if (deps.showToast) deps.showToast("Could not find this sub revision.");
      return;
    }
    const label = subLabel(revisionNumber || round.number || 0, sub.subRevisionNumber);
    if (!window.confirm("Delete " + label + "? This will also remove it from the Google Sheet.")) return;
    if (typeof store.deleteSubRevision !== "function") {
      if (deps.showToast) deps.showToast("Delete is not available. Refresh the page.");
      return;
    }
    const saved = store.deleteSubRevision(order, revisionId, subId, revisionNumber);
    if (!saved) {
      if (deps.showToast) deps.showToast("Could not delete sub revision.");
      return;
    }
    store.upsertOrder(order);
    const syncedOrder = store.getOrder(activeOrderId) || order;
    syncOrderInBackground(syncedOrder, { syncOptions: { skipUploads: true } }).then(function (result) {
      const fresh = store.getOrder(activeOrderId);
      if (fresh) {
        renderDrawer(fresh);
      }
      if (result && result.ok === false) {
        if (deps.showToast) deps.showToast(label + " deleted here, but Google Sheet sync failed. Refresh later or try again.");
        return;
      }
      if (deps.render) deps.render();
      if (deps.showToast) deps.showToast(label + " deleted.");
    });
  }

  function handleSubStatusChange(select, retrying) {
    const order = store.getOrder(activeOrderId);
    if (!order || !select) return;
    const revisionId = select.getAttribute("data-revision-id");
    const subId = select.getAttribute("data-sub-id");
    const revisionNumber = Number(select.getAttribute("data-revision-number")) || 0;
    const previousValue = select.getAttribute("data-previous-value") || "active";
    const newValue = select.value;
    if (!retrying && newValue === previousValue) return;
    const snapshot = JSON.parse(JSON.stringify(order));
    const wrap = select.closest(".rev-sub-status-wrap");
    setStatusWrapState(wrap, "saving");
    const saved = store.setSubRevisionStatus(order, revisionId, subId, newValue, revisionNumber);
    if (!saved) {
      select.value = previousValue;
      setStatusWrapState(wrap, "idle");
      if (deps.showToast) deps.showToast("Could not update sub revision status.");
      return;
    }
    pendingStatusChange = { type: "sub", select: select, snapshot: snapshot, previousValue: previousValue };
    store.upsertOrder(order);
    syncOrderInBackground(order, { syncOptions: { skipUploads: true } }).then(function (result) {
      if (result && result.ok === false) {
        rollbackOrder(snapshot);
        select.value = previousValue;
        setStatusWrapState(wrap, "failed");
        return;
      }
      select.setAttribute("data-previous-value", newValue);
      setStatusWrapState(wrap, "idle");
      pendingStatusChange = null;
      const fresh = store.getOrder(activeOrderId);
      if (fresh) {
        renderDrawer(fresh);
        if (deps.render) deps.render();
      }
    });
  }

  function bindEvents() {
    document.addEventListener("click", function (event) {
      const tab = event.target.closest("[data-rev-tab]");
      if (tab) {
        activeRevisionNumber = Number(tab.getAttribute("data-rev-tab")) || 0;
        const order = store.getOrder(activeOrderId);
        if (order) renderDrawer(order);
        return;
      }
      const addBtn = event.target.closest("[data-add-sub-revision]");
      if (addBtn) {
        if (modalSaving) return;
        const order = store.getOrder(activeOrderId);
        if (!order) return;
        openModal("add-sub", order, addBtn.getAttribute("data-add-sub-revision"), null, activeRevisionNumber);
        return;
      }
      const editMain = event.target.closest("[data-edit-main-revision]");
      if (editMain) {
        const order = store.getOrder(activeOrderId);
        if (!order) return;
        openModal("edit-main", order, editMain.getAttribute("data-edit-main-revision"));
        return;
      }
      const editSub = event.target.closest("[data-edit-sub-revision]");
      if (editSub) {
        const order = store.getOrder(activeOrderId);
        const revisionId = editSub.getAttribute("data-edit-sub-revision");
        const subId = editSub.getAttribute("data-sub-id");
        const round = store.findRevisionRound(order, revisionId);
        const sub = store.findSubRevisionRound(order, revisionId, subId);
        if (!order || !round || !sub) return;
        openModal("edit-sub", order, revisionId, sub, activeRevisionNumber);
        return;
      }
      const deleteSub = event.target.closest("[data-delete-sub-revision]");
      if (deleteSub) {
        handleDeleteSubRevision(
          deleteSub.getAttribute("data-delete-sub-revision"),
          deleteSub.getAttribute("data-sub-id"),
          Number(deleteSub.getAttribute("data-revision-number")) || 0
        );
        return;
      }
      const retryBtn = event.target.closest(".rev-sub-status-retry");
      if (retryBtn && pendingStatusChange && pendingStatusChange.select) {
        const select = pendingStatusChange.select;
        if (pendingStatusChange.type === "main") {
          handleMainStatusChange(select, true);
        } else {
          handleSubStatusChange(select, true);
        }
        return;
      }
      const preview = event.target.closest("[data-preview-attachment]");
      if (preview && deps.openLightbox) {
        const card = preview.closest(".rev-sub-attachments");
        const order = store.getOrder(activeOrderId);
        const round = order && store.findRevisionRound(order, card && card.getAttribute("data-revision-id"));
        const sub = round && store.findSubRevisionRound(order, round.id, card && card.getAttribute("data-sub-id"));
        const att = (sub && sub.attachments || []).find(function (item) {
          return String(item.id) === preview.getAttribute("data-preview-attachment");
        });
        if (att) deps.openLightbox({ name: att.fileName, url: att.imageUrl, previewUrl: att.thumbnailUrl });
        return;
      }
      const remove = event.target.closest("[data-remove-pending]");
      if (remove) {
        const index = Number(remove.getAttribute("data-remove-pending"));
        pendingFiles.splice(index, 1);
        renderModalPreview();
      }
      const closeModalBtn = event.target.closest("[data-close-rev-sub-modal]");
      if (closeModalBtn) closeModal();
    });

    document.addEventListener("change", function (event) {
      const mainSelect = event.target.closest("[data-main-revision-status]");
      if (mainSelect) {
        handleMainStatusChange(mainSelect, false);
        return;
      }
      const subSelect = event.target.closest("[data-sub-revision-status]");
      if (subSelect) {
        handleSubStatusChange(subSelect, false);
      }
    });

    document.addEventListener("click", function (event) {
      const saveTarget = event.target.closest("#rev-sub-save");
      if (saveTarget) {
        event.preventDefault();
        event.stopPropagation();
        saveModal();
        return;
      }
    }, true);

    const fileInput = el("rev-sub-files");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (!fileInput.files || !fileInput.files.length) return;
        store.saveFileBlobs(fileInput.files).then(function (saved) {
          (saved || []).forEach(function (file) {
            pendingFiles.push({
              id: file.id,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
              pendingBlob: file.pendingBlob
            });
          });
          renderModalPreview();
          fileInput.value = "";
        });
      });
    }
    const saveBtn = el("rev-sub-save");
    if (saveBtn) saveBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      saveModal();
    });
    const cancelBtn = el("rev-sub-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      const modal = el("rev-sub-modal");
      if (modal && !modal.hidden) closeModal();
    });
  }

  function mount(options) {
    deps = options || {};
    bindEvents();
  }

  global.OwlisticRevisionSub = {
    mount: mount,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer
  };
})(window);
