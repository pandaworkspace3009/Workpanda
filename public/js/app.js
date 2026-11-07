/**
 * WorkPanda v2.0 — 主應用
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const store = new WorkPandaStore();
  let state = {
    view: "calendar", // calendar | list
    calMode: "month", // month | week
    cursor: new Date(),
    panel: "schedule",
    filters: { month: "", status: "all", attribution: "all", staffId: "all", q: "" },
    editingActivityId: null,
  };

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function ymd(d) {
    const x = d instanceof Date ? d : new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }

  function parseYmd(s) {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function monthLabel(d) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  function weekStart(d) {
    const x = new Date(d);
    const day = x.getDay(); // 0 Sun
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function statusLabel(s) {
    return s === "confirmed" ? "已確認" : "暫時確認";
  }

  function attrLabel(a) {
    return a === "company" ? "公數盤" : "股東獨得";
  }

  function payLocLabel(p) {
    if (p === "company") return "客人入公數戶口";
    if (p === "private") return "股東私人直接收款";
    return "—";
  }

  // ---------- Render shell ----------
  function renderAll() {
    const data = store.get();
    if (!data) return;
    renderMode();
    renderKPIs(data);
    renderPanel();
  }

  function renderMode() {
    const mode = store.getMode();
    let label = "本機 (LocalStorage)";
    if (mode === "cloud") {
      label = store.sampleData ? "雲端同步（本機示範庫）" : "雲端同步（即時）";
      if (store.lastError) label = "雲端未連線 → 本機";
    }
    $("#modeLabel").textContent = label;
    const sel = $("#storageMode");
    if (sel) sel.value = mode === "cloud" ? "cloud" : "local";
  }

  function renderKPIs(data) {
    const k = WPCalc.computeKPIs(data);
    $("#kpiPool").textContent = WPCalc.formatHKD(k.distributablePool);
    $("#kpiCompanyNet").textContent = WPCalc.formatHKD(k.companyPoolNet);
    $("#kpiExclusive").textContent = WPCalc.formatHKD(k.exclusiveNet);
    $("#kpiHold").textContent = WPCalc.formatHKD(k.potentialHold);
    $("#kpiPending").textContent = WPCalc.formatHKD(k.pendingPayroll);
    $("#bufferDisplay").textContent = WPCalc.formatHKD(k.buffer);
  }

  function renderPanel() {
    $$(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.panel === state.panel));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${state.panel}`));
    const data = store.get();
    if (state.panel === "schedule") renderSchedule(data);
    if (state.panel === "roster") renderRoster(data);
    if (state.panel === "cashflow") renderCashflow(data);
    if (state.panel === "settlement") renderSettlement(data);
    if (state.panel === "people") renderPeople(data);
    if (state.panel === "settings") renderSettings(data);
  }

  // ---------- Schedule / Calendar ----------
  function renderSchedule(data) {
    const filters = { ...state.filters };
    if (!filters.month) {
      filters.month = `${state.cursor.getFullYear()}-${String(state.cursor.getMonth() + 1).padStart(2, "0")}`;
      $("#filterMonth").value = filters.month;
    }
    const acts = WPCalc.filterActivities(data, filters);

    $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
    $$("[data-cal]").forEach((b) => b.classList.toggle("active", b.dataset.cal === state.calMode));

    $("#calendarWrap").style.display = state.view === "calendar" ? "" : "none";
    $("#listWrap").style.display = state.view === "list" ? "" : "none";
    $("#calModeGroup").style.display = state.view === "calendar" ? "" : "none";

    if (state.view === "calendar") {
      if (state.calMode === "month") renderMonth(data, acts);
      else renderWeek(data, acts);
    } else {
      renderList(data, acts);
    }
  }

  function renderMonth(data, acts) {
    const cursor = state.cursor;
    $("#calTitle").textContent = monthLabel(cursor);
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const today = ymd(new Date());

    const dow = ["日", "一", "二", "三", "四", "五", "六"];
    let html = dow.map((d) => `<div class="cal-dow">${d}</div>`).join("");

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = ymd(d);
      const inMonth = d.getMonth() === cursor.getMonth();
      const dayActs = acts.filter((a) => a.date === key);
      html += `<div class="cal-cell ${inMonth ? "" : "muted"} ${key === today ? "today" : ""}" data-date="${key}">
        <div class="day-num">${d.getDate()}</div>
        ${dayActs
          .slice(0, 3)
          .map((a) => eventChip(a, data))
          .join("")}
        ${dayActs.length > 3 ? `<div class="meta" style="font-size:0.68rem;color:var(--muted)">+${dayActs.length - 3} 更多</div>` : ""}
      </div>`;
    }
    $("#calGrid").innerHTML = html;
    $("#calGrid").className = "cal-grid";
  }

  function eventChip(a, data) {
    const sh =
      a.attribution === "exclusive"
        ? (data.shareholders || []).find((s) => s.id === a.exclusiveShareholderId)?.name || ""
        : "";
    const icon = a.attribution === "exclusive" ? "◆" : "●";
    const name = escapeHtml(a.name);
    const meta = escapeHtml(`${a.startTime || ""}${sh ? " · " + sh : ""}`);
    const st = safeToken(a.status, STATUS_OK);
    const at = safeToken(a.attribution, ATTR_OK);
    return `<button type="button" class="event-chip ${st} ${at}" data-act="${escapeAttr(a.id)}" title="${name}">
      ${icon} ${name}
      <span class="meta">${meta}</span>
    </button>`;
  }

  function renderWeek(data, acts) {
    const start = weekStart(state.cursor);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    $("#calTitle").textContent = `${ymd(start)} 至 ${ymd(end)}`;

    const hours = [];
    for (let h = 8; h <= 22; h++) hours.push(h);

    let html = `<div class="week-grid"><div class="week-times"><div class="week-day-header"></div>`;
    hours.forEach((h) => {
      html += `<div class="week-time">${String(h).padStart(2, "0")}:00</div>`;
    });
    html += `</div>`;

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = ymd(d);
      const dayActs = acts.filter((a) => a.date === key);
      html += `<div class="week-day">
        <div class="week-day-header">${["日","一","二","三","四","五","六"][d.getDay()]} ${d.getDate()}</div>
        <div class="week-day-body" data-date="${key}">`;
      dayActs.forEach((a) => {
        const sh = a.startTime ? Number(String(a.startTime).split(":")[0]) : 9;
        const eh = a.endTime ? Number(String(a.endTime).split(":")[0]) : sh + 2;
        const top = Math.max(0, (sh - 8) * 48);
        const height = Math.max(36, (Math.max(eh, sh + 1) - sh) * 48);
        const st = safeToken(a.status, STATUS_OK);
        const at = safeToken(a.attribution, ATTR_OK);
        const clsSafe = `week-event event-chip ${st} ${at}`;
        html += `<button type="button" class="${clsSafe}" data-act="${escapeAttr(a.id)}" style="top:${Number(top)}px;height:${Number(height)}px">${escapeHtml(a.name)}<span class="meta">${escapeHtml(a.startTime || "")}–${escapeHtml(a.endTime || "")}</span></button>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
    $("#calGrid").innerHTML = html;
    $("#calGrid").className = "";
  }

  function renderList(data, acts) {
    const sorted = [...acts].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!sorted.length) {
      $("#listBody").innerHTML = `<tr><td colspan="8" class="empty">呢個篩選條件下未有活動</td></tr>`;
      return;
    }
    $("#listBody").innerHTML = sorted
      .map((a) => {
        const net = WPCalc.activityNetProfit(a);
        const sh = (data.shareholders || []).find((s) => s.id === a.exclusiveShareholderId);
        const st = safeToken(a.status, STATUS_OK);
        const at = safeToken(a.attribution, ATTR_OK);
        return `<tr data-act-row="${escapeAttr(a.id)}" style="cursor:pointer">
          <td>${escapeHtml(a.date)}<div style="color:var(--muted);font-size:0.78rem">${escapeHtml(a.startTime || "")}–${escapeHtml(a.endTime || "")}</div></td>
          <td><strong>${escapeHtml(a.name)}</strong><div style="color:var(--muted);font-size:0.78rem">${escapeHtml(a.notes || "")}</div></td>
          <td><span class="badge ${st}">${statusLabel(st)}</span></td>
          <td><span class="badge ${at}">${attrLabel(at)}</span>${
            at === "exclusive"
              ? `<div style="font-size:0.75rem;margin-top:4px">${escapeHtml(sh?.name || "")}<br>${payLocLabel(a.paymentLocation)}</div>`
              : ""
          }</td>
          <td>${WPCalc.formatHKD(a.revenue)}</td>
          <td>${WPCalc.formatHKD(WPCalc.laborTotal(a) + Number(a.directCosts || 0))}</td>
          <td><strong>${WPCalc.formatHKD(net)}</strong>${st === "tentative" ? `<div style="font-size:0.72rem;color:var(--hold)">唔計入實際利潤</div>` : ""}</td>
          <td><button type="button" class="btn sm" data-act="${escapeAttr(a.id)}">詳情</button></td>
        </tr>`;
      })
      .join("");
  }

  // ---------- Roster ----------
  function renderRoster(data) {
    const month = $("#rosterMonth")?.value || `${state.cursor.getFullYear()}-${String(state.cursor.getMonth() + 1).padStart(2, "0")}`;
    if ($("#rosterMonth") && !$("#rosterMonth").value) $("#rosterMonth").value = month;
    const staffId = $("#rosterStaff")?.value || "all";
    populateStaffSelect($("#rosterStaff"), data, true);
    if (staffId) $("#rosterStaff").value = staffId;

    const rows = WPCalc.computeRoster(data, {
      month,
      staffId: staffId === "all" ? undefined : staffId,
    });

    const byStaff = {};
    rows.forEach((r) => {
      if (!byStaff[r.staffId]) byStaff[r.staffId] = { name: r.staffName, total: 0, rows: [] };
      byStaff[r.staffId].total = WPCalc.money(byStaff[r.staffId].total + r.wage);
      byStaff[r.staffId].rows.push(r);
    });

    const cards = Object.values(byStaff);
    if (!cards.length) {
      $("#rosterCards").innerHTML = `<div class="empty section-card">未有排班紀錄</div>`;
      return;
    }

    $("#rosterCards").innerHTML = cards
      .map((c) => {
        return `<div class="staff-card">
          <h3>${escapeHtml(c.name)}</h3>
          <div class="share-pct">累計應付薪金 <strong>${WPCalc.formatHKD(c.total)}</strong></div>
          <table class="list-table">
            <thead><tr><th>日期</th><th>活動</th><th>時段</th><th>狀態</th><th>薪金</th></tr></thead>
            <tbody>
              ${c.rows
                .map(
                  (r) => `<tr>
                  <td>${escapeHtml(r.date)}</td>
                  <td>${escapeHtml(r.activityName)}${safeToken(r.attribution, ATTR_OK) === "exclusive" ? ' <span class="badge exclusive">獨得</span>' : ""}</td>
                  <td>${escapeHtml(r.startTime || "")}–${escapeHtml(r.endTime || "")}</td>
                  <td><span class="badge ${safeToken(r.status, STATUS_OK)}">${statusLabel(safeToken(r.status, STATUS_OK))}</span></td>
                  <td>${WPCalc.formatHKD(r.wage)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`;
      })
      .join("");
  }

  // ---------- Cashflow ----------
  function renderCashflow(data) {
    const month = $("#cfMonth")?.value || "";
    const rows = (data.ledger || [])
      .filter((e) => !e.hidden)
      .filter((e) => !month || String(e.date || "").startsWith(month))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    $("#cashflowBody").innerHTML = rows.length
      ? rows
          .map((e) => {
            const sh = (data.shareholders || []).find((s) => s.id === e.reimbursedByShareholderId);
            const src =
              e.paymentSource === "company"
                ? "公數支付"
                : e.paymentSource === "shareholder"
                  ? `股東代墊${sh ? "・" + escapeHtml(sh.name) : ""}`
                  : e.paymentSource === "exclusive_internal"
                    ? "獨得單內部成本（唔入公數）"
                    : e.paymentSource === "private"
                      ? "私人"
                      : escapeHtml(e.paymentSource || "—");
            return `<tr class="${e.tentative ? "muted" : ""}">
              <td>${escapeHtml(e.date || "")}${e.autoSynced ? ' <span class="badge auto">自動連動</span>' : ""}${e.tentative ? ' <span class="badge tentative">Hold</span>' : ""}</td>
              <td>${e.type === "income" ? "收入" : "支出"}</td>
              <td>${escapeHtml(e.category || "")}<div style="color:var(--muted);font-size:0.78rem">${escapeHtml(e.description || "")}</div></td>
              <td style="color:${e.type === "income" ? "var(--brand)" : "var(--danger)"}">${e.type === "income" ? "+" : "-"}${WPCalc.formatHKD(e.amount)}</td>
              <td>${
                e.type === "expense"
                  ? `<span class="badge ${safeToken(e.paymentStatus, PAY_OK) || "pending"}">${safeToken(e.paymentStatus, PAY_OK) === "paid" ? "已支付" : "待出糧"}</span>`
                  : "—"
              }</td>
              <td>${src}</td>
              <td>
                ${
                  e.autoSynced
                    ? `<button type="button" class="btn sm" data-edit-auto="${escapeAttr(e.activityId || "")}">睇活動</button>`
                    : `<button type="button" class="btn sm" data-edit-led="${escapeAttr(e.id)}">編輯</button>
                       <button type="button" class="btn sm danger" data-del-led="${escapeAttr(e.id)}">刪</button>`
                }
                ${
                  e.type === "expense" && e.paymentSource !== "exclusive_internal" && e.paymentSource !== "private"
                    ? `<button type="button" class="btn sm" data-toggle-pay="${escapeAttr(e.id)}">${safeToken(e.paymentStatus, PAY_OK) === "paid" ? "標待出糧" : "標已支付"}</button>`
                    : ""
                }
              </td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" class="empty">未有收支紀錄</td></tr>`;
  }

  // ---------- Settlement ----------
  function renderSettlement(data) {
    const cards = WPCalc.computeShareholderCards(data);
    const k = WPCalc.computeKPIs(data);
    $("#settlementMeta").innerHTML = `
      <div class="section-card" style="padding:14px 16px;margin-bottom:14px">
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between">
          <div>
            <div style="color:var(--muted);font-size:0.8rem">建議保留營運資金（Buffer）</div>
            <div style="font-size:1.2rem;font-weight:700">${WPCalc.formatHKD(k.buffer)}</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.8rem">Buffer 前公司現金約數</div>
            <div style="font-size:1.2rem;font-weight:700">${WPCalc.formatHKD(k.companyCashBeforeBuffer)}</div>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.8rem">公數可分配現金池</div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--brand)">${WPCalc.formatHKD(k.distributablePool)}</div>
          </div>
          <label class="field" style="min-width:160px">調整 Buffer（HK$）
            <input type="number" id="bufferInput" value="${escapeAttr(String(Number(data.settings.bufferAmount || 0)))}" min="0" step="100">
          </label>
        </div>
      </div>`;

    $("#settlementCards").innerHTML = cards
      .map((c) => {
        const sh = c.shareholder;
        return `<div class="shareholder-card" data-sh="${escapeAttr(sh.id)}">
          <h3>${escapeHtml(sh.name)}</h3>
          <div class="share-pct">佔股 ${escapeHtml(String(sh.sharePercent ?? ""))}%</div>
          <div class="metric-row">
            <div>公數按股分紅應得額<span class="hint">按佔股比例計算，已扣已提領</span></div>
            <div class="n">${WPCalc.formatHKD(c.dividendDue)}</div>
          </div>
          <div class="metric-row">
            <div>個人獨得項目未結算淨利<span class="hint">客人入公數、待公司撥付</span></div>
            <div class="n" style="color:var(--exclusive)">${WPCalc.formatHKD(c.exclusiveDue)}</div>
          </div>
          <div class="metric-row">
            <div>待退還股東代墊款<span class="hint">私人幫公司墊支</span></div>
            <div class="n" style="color:var(--hold)">${WPCalc.formatHKD(c.reimburseDue)}</div>
          </div>
          ${
            c.privateExclusiveNet
              ? `<div class="metric-row"><div>私人收款獨得業績<span class="hint">已落袋，唔產生公司應付</span></div><div class="n">${WPCalc.formatHKD(c.privateExclusiveNet)}</div></div>`
              : ""
          }
          <div class="metric-row"><div><strong>合計應付</strong></div><div class="n">${WPCalc.formatHKD(c.totalPayable)}</div></div>
          <div class="withdraw-actions">
            <button type="button" class="btn primary sm" data-withdraw="dividend" data-sh="${escapeAttr(sh.id)}" ${c.dividendDue <= 0 ? "disabled" : ""}>提取公數分紅（${WPCalc.formatHKD(c.dividendDue)}）</button>
            <button type="button" class="btn sm" data-withdraw="exclusive" data-sh="${escapeAttr(sh.id)}" ${c.exclusiveDue <= 0 ? "disabled" : ""}>結算個人獨得利潤（${WPCalc.formatHKD(c.exclusiveDue)}）</button>
            <button type="button" class="btn sm" data-withdraw="reimbursement" data-sh="${escapeAttr(sh.id)}" ${c.reimburseDue <= 0 ? "disabled" : ""}>退還代墊款（${WPCalc.formatHKD(c.reimburseDue)}）</button>
          </div>
        </div>`;
      })
      .join("");

    // settlement history
    const hist = [...(data.settlements || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    $("#settlementHistory").innerHTML = hist.length
      ? `<table class="list-table"><thead><tr><th>日期</th><th>股東</th><th>類型</th><th>金額</th><th>備註</th></tr></thead><tbody>
        ${hist
          .map((s) => {
            const sh = (data.shareholders || []).find((x) => x.id === s.shareholderId);
            const type =
              s.type === "dividend" ? "公數分紅" : s.type === "exclusive" ? "獨得結算" : "退還代墊";
            return `<tr><td>${escapeHtml(s.date || "")}</td><td>${escapeHtml(sh?.name || "")}</td><td>${type}</td><td>${WPCalc.formatHKD(s.amount)}</td><td>${escapeHtml(s.note || "")}</td></tr>`;
          })
          .join("")}
      </tbody></table>`
      : `<div class="empty">未有提領紀錄</div>`;
  }

  // ---------- People ----------
  function renderPeople(data) {
    $("#shareholderList").innerHTML = (data.shareholders || [])
      .map(
        (s) => `<div class="staff-card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
          <div><strong>${escapeHtml(s.name)}</strong><div class="share-pct">佔股 ${escapeHtml(String(s.sharePercent ?? ""))}%</div></div>
          <div>
            <button class="btn sm" data-edit-sh="${escapeAttr(s.id)}">編輯</button>
            <button class="btn sm danger" data-del-sh="${escapeAttr(s.id)}">刪除</button>
          </div>
        </div>
      </div>`
      )
      .join("") || `<div class="empty">未有股東</div>`;

    $("#staffList").innerHTML = (data.staff || [])
      .map((s) => {
        const sh = (data.shareholders || []).find((x) => x.id === s.shareholderId);
        return `<div class="staff-card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
            <div><strong>${escapeHtml(s.name)}</strong><div class="share-pct">${sh ? "股東：" + escapeHtml(sh.name) : "協助人員／兼職"}</div></div>
            <div>
              <button class="btn sm" data-edit-st="${escapeAttr(s.id)}">編輯</button>
              <button class="btn sm danger" data-del-st="${escapeAttr(s.id)}">刪除</button>
            </div>
          </div>
        </div>`;
      })
      .join("") || `<div class="empty">未有人員</div>`;
  }

  // ---------- Settings ----------
  function renderSettings(data) {
    $("#companyNameInput").value = data.settings?.companyName || "WorkPanda";
    $("#storageMode").value = store.getMode() === "cloud" ? "cloud" : "local";
    const status = $("#firebaseStatus");
    if (!status) return;
    if (store.getMode() === "cloud" && store.cloudReady) {
      status.textContent = store.sampleData
        ? "已連上雲端 API（本機示範庫）。請將 App 設為 Private／Team，各裝置 Cursor 登入後即時同步。"
        : "已連上租戶雲端工作區（Private／Team + Cursor 登入），約每 2.5 秒自動同步。";
      status.style.color = "var(--brand)";
    } else if (store.lastError) {
      status.textContent = store.lastError;
      status.style.color = "var(--hold)";
    } else {
      status.textContent = "本機模式：資料只存此瀏覽器。雲端同步需 Private／Team，並拒絕 Public 讀寫財務庫。";
      status.style.color = "var(--muted)";
    }
  }

  // ---------- Modal: Activity ----------
  function openActivityModal(activity, presetDate) {
    const data = store.get();
    const a =
      activity ||
      {
        id: wpUid("act"),
        name: "",
        date: presetDate || ymd(new Date()),
        startTime: "10:00",
        endTime: "18:00",
        notes: "",
        revenue: 0,
        directCosts: 0,
        status: "confirmed",
        attribution: "company",
        exclusiveShareholderId: null,
        paymentLocation: null,
        assignments: [],
      };
    state.editingActivityId = a.id;

    populateShareholderSelect($("#actExclusiveSh"), data, false);
    const body = $("#activityModal");
    $("#actModalTitle").textContent = activity ? "活動詳情／排班" : "新增活動";
    $("#actName").value = a.name;
    $("#actDate").value = a.date;
    $("#actStart").value = a.startTime || "";
    $("#actEnd").value = a.endTime || "";
    $("#actNotes").value = a.notes || "";
    $("#actRevenue").value = a.revenue || 0;
    $("#actDirect").value = a.directCosts || 0;
    $("#actStatus").value = a.status || "confirmed";
    $("#actAttr").value = a.attribution || "company";
    $("#actExclusiveSh").value = a.exclusiveShareholderId || "";
    $("#actPayLoc").value = a.paymentLocation || "company";
    toggleAttrFields();
    renderAssignmentEditor(a.assignments || []);
    updateActNetPreview();
    body.dataset.id = a.id;
    body.dataset.isNew = activity ? "0" : "1";
    openModal("activityModal");
  }

  function toggleAttrFields() {
    const attr = $("#actAttr").value;
    const show = attr === "exclusive";
    $("#exclusiveFields").style.display = show ? "" : "none";
  }

  function renderAssignmentEditor(assignments) {
    const data = store.get();
    const box = $("#assignmentList");
    if (!assignments.length) {
      box.innerHTML = `<div class="empty" style="padding:12px">未有排班，按下方加入人員</div>`;
    } else {
      box.innerHTML = assignments
        .map((as, idx) => {
          const opts = (data.staff || [])
            .map((s) => `<option value="${escapeAttr(s.id)}" ${s.id === as.staffId ? "selected" : ""}>${escapeHtml(s.name)}</option>`)
            .join("");
          return `<div class="assignment-row" data-as-idx="${Number(idx)}">
            <label class="field">人員<select data-as-field="staffId">${opts}</select></label>
            <label class="field">薪金（HK$）<input type="number" min="0" step="50" data-as-field="wage" value="${Number(as.wage || 0)}"></label>
            <label class="field">開始<input type="time" data-as-field="startTime" value="${escapeAttr(as.startTime || "")}"></label>
            <label class="field">結束<input type="time" data-as-field="endTime" value="${escapeAttr(as.endTime || "")}"></label>
            <button type="button" class="btn sm danger" data-as-del="${Number(idx)}">刪</button>
          </div>`;
        })
        .join("");
    }
    updateActNetPreview();
  }

  function readAssignmentsFromEditor() {
    return $$("#assignmentList .assignment-row").map((row) => {
      return {
        id: wpUid("as"),
        staffId: $('[data-as-field="staffId"]', row).value,
        wage: Number($('[data-as-field="wage"]', row).value || 0),
        startTime: $('[data-as-field="startTime"]', row).value,
        endTime: $('[data-as-field="endTime"]', row).value,
      };
    });
  }

  function updateActNetPreview() {
    const revenue = Number($("#actRevenue").value || 0);
    const direct = Number($("#actDirect").value || 0);
    const labor = readAssignmentsFromEditor().reduce((s, a) => s + Number(a.wage || 0), 0);
    const net = WPCalc.money(revenue - direct - labor);
    $("#actNetPreview").textContent = WPCalc.formatHKD(net);
  }

  async function saveActivityFromModal() {
    const id = $("#activityModal").dataset.id;
    const attribution = $("#actAttr").value;
    const activity = {
      id,
      name: $("#actName").value.trim() || "未命名活動",
      date: $("#actDate").value,
      startTime: $("#actStart").value,
      endTime: $("#actEnd").value,
      notes: $("#actNotes").value.trim(),
      revenue: Number($("#actRevenue").value || 0),
      directCosts: Number($("#actDirect").value || 0),
      status: $("#actStatus").value,
      attribution,
      exclusiveShareholderId: attribution === "exclusive" ? $("#actExclusiveSh").value || null : null,
      paymentLocation: attribution === "exclusive" ? $("#actPayLoc").value : null,
      assignments: readAssignmentsFromEditor(),
    };
    if (attribution === "exclusive" && !activity.exclusiveShareholderId) {
      toast("請選擇獨得股東");
      return;
    }
    await store.saveActivity(activity);
    closeModal("activityModal");
    toast("活動已儲存，收支帳已自動連動");
  }

  // ---------- Modal: Ledger ----------
  function openLedgerModal(entry) {
    const data = store.get();
    const e =
      entry ||
      {
        id: wpUid("led"),
        date: ymd(new Date()),
        type: "expense",
        category: "雜項",
        description: "",
        amount: 0,
        activityId: null,
        autoSynced: false,
        paymentStatus: "pending",
        paymentSource: "company",
        reimbursedByShareholderId: null,
      };
    $("#ledModalTitle").textContent = entry ? "編輯收支" : "新增日常收支";
    $("#ledDate").value = e.date;
    $("#ledType").value = e.type;
    $("#ledCategory").value = e.category || "";
    $("#ledDesc").value = e.description || "";
    $("#ledAmount").value = e.amount || 0;
    $("#ledPayStatus").value = e.paymentStatus || "pending";
    $("#ledPaySource").value = e.paymentSource === "shareholder" ? "shareholder" : "company";
    populateShareholderSelect($("#ledShareholder"), data, false);
    $("#ledShareholder").value = e.reimbursedByShareholderId || "";
    toggleLedShareholder();
    $("#ledgerModal").dataset.id = e.id;
    openModal("ledgerModal");
  }

  function toggleLedShareholder() {
    const show = $("#ledPaySource").value === "shareholder";
    $("#ledShWrap").style.display = show ? "" : "none";
  }

  async function saveLedgerFromModal() {
    const source = $("#ledPaySource").value;
    const entry = {
      id: $("#ledgerModal").dataset.id,
      date: $("#ledDate").value,
      type: $("#ledType").value,
      category: $("#ledCategory").value.trim() || "雜項",
      description: $("#ledDesc").value.trim(),
      amount: Number($("#ledAmount").value || 0),
      activityId: null,
      autoSynced: false,
      paymentStatus: $("#ledType").value === "expense" ? $("#ledPayStatus").value : "paid",
      paymentSource: source,
      reimbursedByShareholderId: source === "shareholder" ? $("#ledShareholder").value || null : null,
    };
    if (source === "shareholder" && !entry.reimbursedByShareholderId) {
      toast("請選擇代墊股東");
      return;
    }
    await store.saveLedger(entry);
    closeModal("ledgerModal");
    toast("收支已儲存");
  }

  // ---------- People modals ----------
  function openShareholderModal(sh) {
    const s = sh || { id: wpUid("sh"), name: "", sharePercent: 0 };
    $("#shName").value = s.name;
    $("#shPct").value = s.sharePercent;
    $("#shareholderModal").dataset.id = s.id;
    openModal("shareholderModal");
  }

  function openStaffModal(st) {
    const data = store.get();
    const s = st || { id: wpUid("st"), name: "", shareholderId: null };
    $("#stName").value = s.name;
    populateShareholderSelect($("#stShareholder"), data, true);
    $("#stShareholder").value = s.shareholderId || "";
    $("#staffModal").dataset.id = s.id;
    openModal("staffModal");
  }

  // ---------- Helpers ----------
  function populateStaffSelect(sel, data, withAll) {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML =
      (withAll ? `<option value="all">全部人員</option>` : "") +
      (data.staff || []).map((s) => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`).join("");
    if (cur) sel.value = cur;
  }

  function populateShareholderSelect(sel, data, withEmpty) {
    if (!sel) return;
    sel.innerHTML =
      (withEmpty ? `<option value="">— 非股東 —</option>` : `<option value="">請選擇</option>`) +
      (data.shareholders || []).map((s) => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`).join("");
  }

  function populateFilterStaff(data) {
    populateStaffSelect($("#filterStaff"), data, true);
  }

  function openModal(id) {
    $(`#${id}`).classList.add("open");
  }
  function closeModal(id) {
    $(`#${id}`).classList.remove("open");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, "&#96;");
  }

  /** Only allow known enum tokens into class names / data attributes */
  function safeToken(value, allowed) {
    const v = String(value ?? "");
    return allowed.has(v) ? v : "";
  }

  const STATUS_OK = new Set(["confirmed", "tentative"]);
  const ATTR_OK = new Set(["company", "exclusive"]);
  const PAY_OK = new Set(["paid", "pending"]);

  // ---------- Events ----------
  function bindEvents() {
    // nav
    $$(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.panel = btn.dataset.panel;
        renderPanel();
      });
    });

    // view toggles
    $$("[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        state.view = b.dataset.view;
        renderSchedule(store.get());
      })
    );
    $$("[data-cal]").forEach((b) =>
      b.addEventListener("click", () => {
        state.calMode = b.dataset.cal;
        renderSchedule(store.get());
      })
    );

    $("#prevPeriod").addEventListener("click", () => {
      if (state.calMode === "week" && state.view === "calendar") state.cursor.setDate(state.cursor.getDate() - 7);
      else state.cursor.setMonth(state.cursor.getMonth() - 1);
      syncFilterMonthFromCursor();
      renderSchedule(store.get());
    });
    $("#nextPeriod").addEventListener("click", () => {
      if (state.calMode === "week" && state.view === "calendar") state.cursor.setDate(state.cursor.getDate() + 7);
      else state.cursor.setMonth(state.cursor.getMonth() + 1);
      syncFilterMonthFromCursor();
      renderSchedule(store.get());
    });
    $("#todayBtn").addEventListener("click", () => {
      state.cursor = new Date();
      syncFilterMonthFromCursor();
      renderSchedule(store.get());
    });

    function syncFilterMonthFromCursor() {
      const m = `${state.cursor.getFullYear()}-${String(state.cursor.getMonth() + 1).padStart(2, "0")}`;
      $("#filterMonth").value = m;
      state.filters.month = m;
    }

    $("#btnNewActivity").addEventListener("click", () => openActivityModal(null));
    $("#btnNewLedger").addEventListener("click", () => openLedgerModal(null));
    $("#btnNewShareholder").addEventListener("click", () => openShareholderModal(null));
    $("#btnNewStaff").addEventListener("click", () => openStaffModal(null));

    // filters
    ["filterMonth", "filterStatus", "filterAttr", "filterStaff", "filterQ"].forEach((id) => {
      $(`#${id}`)?.addEventListener("input", () => {
        state.filters.month = $("#filterMonth").value;
        state.filters.status = $("#filterStatus").value;
        state.filters.attribution = $("#filterAttr").value;
        state.filters.staffId = $("#filterStaff").value;
        state.filters.q = $("#filterQ").value.trim();
        if (state.filters.month) {
          const [y, m] = state.filters.month.split("-").map(Number);
          state.cursor = new Date(y, m - 1, 1);
        }
        renderSchedule(store.get());
      });
    });

    $("#rosterMonth")?.addEventListener("change", () => renderRoster(store.get()));
    $("#rosterStaff")?.addEventListener("change", () => renderRoster(store.get()));
    $("#cfMonth")?.addEventListener("change", () => renderCashflow(store.get()));

    // calendar clicks
    $("#calGrid").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-act]");
      if (chip) {
        const act = store.get().activities.find((a) => a.id === chip.dataset.act);
        if (act) openActivityModal(act);
        return;
      }
      const cell = e.target.closest("[data-date]");
      if (cell) openActivityModal(null, cell.dataset.date);
    });

    $("#listBody").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      const row = e.target.closest("[data-act-row]");
      const id = btn?.dataset.act || row?.dataset.actRow;
      if (!id) return;
      const act = store.get().activities.find((a) => a.id === id);
      if (act) openActivityModal(act);
    });

    // activity modal
    $("#actAttr").addEventListener("change", toggleAttrFields);
    $("#actRevenue").addEventListener("input", updateActNetPreview);
    $("#actDirect").addEventListener("input", updateActNetPreview);
    $("#btnAddAssignment").addEventListener("click", () => {
      const list = readAssignmentsFromEditor();
      const firstStaff = store.get().staff[0];
      list.push({
        id: wpUid("as"),
        staffId: firstStaff?.id || "",
        wage: 1000,
        startTime: $("#actStart").value || "10:00",
        endTime: $("#actEnd").value || "18:00",
      });
      renderAssignmentEditor(list);
    });
    $("#assignmentList").addEventListener("click", (e) => {
      const del = e.target.closest("[data-as-del]");
      if (!del) return;
      const list = readAssignmentsFromEditor();
      list.splice(Number(del.dataset.asDel), 1);
      renderAssignmentEditor(list);
    });
    $("#assignmentList").addEventListener("input", updateActNetPreview);
    $("#btnSaveActivity").addEventListener("click", () => saveActivityFromModal().catch((err) => toast(err.message)));
    $("#btnDeleteActivity").addEventListener("click", async () => {
      const id = $("#activityModal").dataset.id;
      if (!confirm("確定刪除此活動？相關自動連動收支亦會移除。")) return;
      await store.deleteActivity(id);
      closeModal("activityModal");
      toast("活動已刪除");
    });

    // cashflow
    $("#cashflowBody").addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit-led]");
      const del = e.target.closest("[data-del-led]");
      const toggle = e.target.closest("[data-toggle-pay]");
      const auto = e.target.closest("[data-edit-auto]");
      if (auto) {
        const act = store.get().activities.find((a) => a.id === auto.dataset.editAuto);
        if (act) openActivityModal(act);
        return;
      }
      if (edit) {
        const entry = store.get().ledger.find((x) => x.id === edit.dataset.editLed);
        if (entry) openLedgerModal(entry);
        return;
      }
      if (del) {
        if (!confirm("刪除此收支紀錄？")) return;
        try {
          await store.deleteLedger(del.dataset.delLed);
          toast("已刪除");
        } catch (err) {
          toast(err.message);
        }
        return;
      }
      if (toggle) {
        const entry = store.get().ledger.find((x) => x.id === toggle.dataset.togglePay);
        if (!entry) return;
        entry.paymentStatus = entry.paymentStatus === "paid" ? "pending" : "paid";
        await store.saveLedger(entry);
        toast(entry.paymentStatus === "paid" ? "已標示為已支付" : "已標示為待出糧");
      }
    });

    $("#ledPaySource").addEventListener("change", toggleLedShareholder);
    $("#btnSaveLedger").addEventListener("click", () => saveLedgerFromModal().catch((err) => toast(err.message)));

    // settlement
    $("#panel-settlement").addEventListener("change", async (e) => {
      if (e.target.id === "bufferInput") {
        await store.update((d) => {
          d.settings.bufferAmount = Number(e.target.value || 0);
        });
        toast("Buffer 已更新");
      }
    });
    $("#settlementCards").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-withdraw]");
      if (!btn || btn.disabled) return;
      const type = btn.dataset.withdraw;
      const shId = btn.dataset.sh;
      const cards = WPCalc.computeShareholderCards(store.get());
      const card = cards.find((c) => c.shareholder.id === shId);
      if (!card) return;
      const amount =
        type === "dividend" ? card.dividendDue : type === "exclusive" ? card.exclusiveDue : card.reimburseDue;
      if (amount <= 0) return;
      const labels = { dividend: "提取公數分紅", exclusive: "結算個人獨得利潤", reimbursement: "退還代墊款" };
      if (!confirm(`確認${labels[type]} ${WPCalc.formatHKD(amount)}？`)) return;
      await store.addSettlement({
        id: wpUid("set"),
        shareholderId: shId,
        type,
        amount,
        date: ymd(new Date()),
        note: labels[type],
      });
      toast("提領紀錄已生成");
    });

    // people
    $("#shareholderList").addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit-sh]");
      const del = e.target.closest("[data-del-sh]");
      if (edit) {
        const sh = store.get().shareholders.find((x) => x.id === edit.dataset.editSh);
        if (sh) openShareholderModal(sh);
      }
      if (del) {
        if (!confirm("刪除此股東？")) return;
        await store.deleteShareholder(del.dataset.delSh);
        toast("已刪除股東");
      }
    });
    $("#staffList").addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit-st]");
      const del = e.target.closest("[data-del-st]");
      if (edit) {
        const st = store.get().staff.find((x) => x.id === edit.dataset.editSt);
        if (st) openStaffModal(st);
      }
      if (del) {
        if (!confirm("刪除此人員？")) return;
        await store.deleteStaff(del.dataset.delSt);
        toast("已刪除人員");
      }
    });
    $("#btnSaveShareholder").addEventListener("click", async () => {
      await store.saveShareholder({
        id: $("#shareholderModal").dataset.id,
        name: $("#shName").value.trim() || "未命名股東",
        sharePercent: Number($("#shPct").value || 0),
      });
      closeModal("shareholderModal");
      toast("股東已儲存");
    });
    $("#btnSaveStaff").addEventListener("click", async () => {
      await store.saveStaff({
        id: $("#staffModal").dataset.id,
        name: $("#stName").value.trim() || "未命名人員",
        shareholderId: $("#stShareholder").value || null,
      });
      closeModal("staffModal");
      toast("人員已儲存");
    });

    // settings / export
    $("#btnSaveSettings").addEventListener("click", async () => {
      const mode = $("#storageMode").value === "cloud" ? "cloud" : "local";
      await store.update((d) => {
        d.settings.companyName = $("#companyNameInput").value.trim() || "WorkPanda";
      });
      try {
        if (mode !== store.getMode()) {
          await store.setMode(mode);
        } else if (mode === "cloud") {
          await store._pullCloud(true);
        }
        toast("設定已儲存");
        renderAll();
      } catch (err) {
        toast(err.message);
        $("#storageMode").value = store.getMode() === "cloud" ? "cloud" : "local";
      }
    });

    $("#btnExportJSON").addEventListener("click", () => {
      WPCalc.downloadText(`workpanda-backup-${ymd(new Date())}.json`, store.exportJSON(), "application/json");
      toast("已匯出 JSON 備份");
    });
    $("#btnExportCSV").addEventListener("click", () => {
      const data = store.get();
      const acts = WPCalc.filterActivities(data, state.filters);
      WPCalc.downloadText(`workpanda-activities-${ymd(new Date())}.csv`, WPCalc.activitiesToCSV(acts, data), "text/csv");
      toast("已匯出 CSV");
    });
    $("#btnImportJSON").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await store.importJSON(text);
        toast("備份已匯入");
        populateFilterStaff(store.get());
        renderAll();
      } catch (err) {
        toast("匯入失敗：" + err.message);
      }
      e.target.value = "";
    });
    $("#btnResetDemo").addEventListener("click", async () => {
      if (!confirm("重置為示範資料？現有本機資料會被覆蓋。")) return;
      await store.resetDemo();
      populateFilterStaff(store.get());
      toast("已重置示範資料");
    });

    // modal close
    $$("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(b.dataset.close))
    );
    $$(".modal-backdrop").forEach((bd) =>
      bd.addEventListener("click", (e) => {
        if (e.target === bd) bd.classList.remove("open");
      })
    );
  }

  async function boot() {
    bindEvents();
    await store.init();
    const data = store.get();
    const m = `${state.cursor.getFullYear()}-${String(state.cursor.getMonth() + 1).padStart(2, "0")}`;
    $("#filterMonth").value = m;
    state.filters.month = m;
    if ($("#rosterMonth")) $("#rosterMonth").value = m;
    populateFilterStaff(data);
    store.subscribe(() => {
      populateFilterStaff(store.get());
      renderAll();
    });
    renderAll();
  }

  function start() {
    boot().catch((err) => {
      console.error(err);
      toast("初始化失敗：" + err.message);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
