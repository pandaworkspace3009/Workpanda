/**
 * WorkPanda 分帳／利潤計算引擎
 * 單一數據源：利潤只從活動計算，唔重複扣自動連動 ledger
 */
(function (global) {
  function money(n) {
    const v = Number(n) || 0;
    return Math.round(v * 100) / 100;
  }

  function formatHKD(n) {
    const v = money(n);
    return (
      "HK$" +
      v.toLocaleString("en-HK", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    );
  }

  function laborTotal(activity) {
    return money((activity.assignments || []).reduce((s, a) => s + Number(a.wage || 0), 0));
  }

  function activityNetProfit(activity) {
    const revenue = money(activity.revenue);
    const direct = money(activity.directCosts);
    const labor = laborTotal(activity);
    return money(revenue - direct - labor);
  }

  function isConfirmed(activity) {
    return activity.status === "confirmed";
  }

  /**
   * Dashboard KPIs
   */
  function computeKPIs(data) {
    const acts = data.activities || [];
    const ledger = data.ledger || [];
    const settlements = data.settlements || [];
    const buffer = money(data.settings?.bufferAmount || 0);

    let companyPoolNet = 0; // 公數實際總淨利（已確認公數單）
    let exclusiveNet = 0; // 股東獨得項目總淨利（已確認，不論收款位置）
    let potentialHold = 0; // Hold 單預計潛在利潤
    let exclusiveReceivableTotal = 0; // 入公數待撥付之獨得淨利

    acts.forEach((a) => {
      const net = activityNetProfit(a);
      if (a.status === "tentative") {
        potentialHold = money(potentialHold + net);
        return;
      }
      if (!isConfirmed(a)) return;

      if (a.attribution === "company") {
        companyPoolNet = money(companyPoolNet + net);
      } else if (a.attribution === "exclusive") {
        exclusiveNet = money(exclusiveNet + net);
        if (a.paymentLocation === "company") {
          exclusiveReceivableTotal = money(exclusiveReceivableTotal + net);
        }
      }
    });

    // 待出糧：非 tentative、非 exclusive_internal／private 隱藏、pending 支出
    const pendingPayroll = money(
      ledger
        .filter(
          (e) =>
            e.type === "expense" &&
            e.paymentStatus === "pending" &&
            !e.tentative &&
            e.paymentSource !== "exclusive_internal" &&
            e.paymentSource !== "private" &&
            !e.hidden
        )
        .reduce((s, e) => s + Number(e.amount || 0), 0)
    );

    // 已提取之分紅／獨得／代墊
    const withdrawnDividend = money(
      settlements.filter((s) => s.type === "dividend").reduce((s, x) => s + Number(x.amount || 0), 0)
    );
    const withdrawnExclusive = money(
      settlements
        .filter((s) => s.type === "exclusive")
        .reduce((s, x) => s + Number(x.amount || 0), 0)
    );
    const withdrawnReimburse = money(
      settlements
        .filter((s) => s.type === "reimbursement")
        .reduce((s, x) => s + Number(x.amount || 0), 0)
    );

    // 公數現金池粗算：
    // 確認公數收入（活動）+ 手動雜項收入 − 公數承擔之已確認支出 − 已提分紅／已結算獨得（入公數）／已退代墊
    const manualIncome = money(
      ledger
        .filter((e) => e.type === "income" && !e.autoSynced && !e.tentative)
        .reduce((s, e) => s + Number(e.amount || 0), 0)
    );

    // 公數承擔成本：手動支出（company 或 shareholder 代墊）+ 公數單自動成本／人工（非 exclusive_internal）
    // 注意：獨得單成本唔入公數
    // 活動收入已在 companyPoolNet 以淨利反映；此處用淨利 + 雜項 − 非活動公數支出 更清晰
    // 更精確：可分配現金池 = 公數淨利 + 雜項收入 − 非活動公數支出（已確認） − 待出糧仍要預留？規格係「可分配現金池」扣 buffer
    const nonActivityCompanyExpense = money(
      ledger
        .filter(
          (e) =>
            e.type === "expense" &&
            !e.autoSynced &&
            !e.tentative &&
            (e.paymentSource === "company" || e.paymentSource === "shareholder")
        )
        .reduce((s, e) => s + Number(e.amount || 0), 0)
    );

    // 獨得入公數的收入會增加公司戶口現金，但全數應付給股東 → 在 exclusiveReceivable 反映
    // 可分配公數現金 ≈ 公數淨利 + 雜項收入 − 雜項／固定開支 − 已提分紅 − buffer 前數字
    // 另加：獨得入公數淨利（現金在公司）− 已結算獨得
    const companyCashBeforeBuffer = money(
      companyPoolNet +
        exclusiveReceivableTotal +
        manualIncome -
        nonActivityCompanyExpense -
        withdrawnDividend -
        withdrawnExclusive -
        withdrawnReimburse
    );

    const distributablePool = money(Math.max(0, companyCashBeforeBuffer - buffer));

    return {
      companyPoolNet,
      exclusiveNet,
      exclusiveReceivableTotal,
      potentialHold,
      pendingPayroll,
      buffer,
      companyCashBeforeBuffer,
      distributablePool,
      withdrawnDividend,
      withdrawnExclusive,
      withdrawnReimburse,
      manualIncome,
      nonActivityCompanyExpense,
    };
  }

  /**
   * 每位股東三個獨立數字 + 已提領
   */
  function computeShareholderCards(data) {
    const kpis = computeKPIs(data);
    const shareholders = data.shareholders || [];
    const totalShare = shareholders.reduce((s, x) => s + Number(x.sharePercent || 0), 0) || 100;

    const withdrawnBy = {};
    (data.settlements || []).forEach((s) => {
      if (!withdrawnBy[s.shareholderId]) {
        withdrawnBy[s.shareholderId] = { dividend: 0, exclusive: 0, reimbursement: 0 };
      }
      withdrawnBy[s.shareholderId][s.type] = money(
        (withdrawnBy[s.shareholderId][s.type] || 0) + Number(s.amount || 0)
      );
    });

    return shareholders.map((sh) => {
      const ratio = Number(sh.sharePercent || 0) / totalShare;

      // 1. 公數按股分紅應得（總公數淨利按股 − 已提）
      const dividendGross = money(kpis.companyPoolNet * ratio);
      const dividendWithdrawn = withdrawnBy[sh.id]?.dividend || 0;
      const dividendDue = money(Math.max(0, dividendGross - dividendWithdrawn));

      // 2. 個人獨得未結算（入公數收款）
      let exclusiveGross = 0;
      (data.activities || []).forEach((a) => {
        if (
          a.status === "confirmed" &&
          a.attribution === "exclusive" &&
          a.exclusiveShareholderId === sh.id &&
          a.paymentLocation === "company"
        ) {
          exclusiveGross = money(exclusiveGross + activityNetProfit(a));
        }
      });
      const exclusiveWithdrawn = withdrawnBy[sh.id]?.exclusive || 0;
      const exclusiveDue = money(Math.max(0, exclusiveGross - exclusiveWithdrawn));

      // 3. 待退還代墊
      let reimburseGross = 0;
      (data.ledger || []).forEach((e) => {
        if (
          e.type === "expense" &&
          !e.tentative &&
          e.paymentSource === "shareholder" &&
          e.reimbursedByShareholderId === sh.id &&
          e.paymentSource !== "exclusive_internal"
        ) {
          reimburseGross = money(reimburseGross + Number(e.amount || 0));
        }
      });
      const reimburseWithdrawn = withdrawnBy[sh.id]?.reimbursement || 0;
      const reimburseDue = money(Math.max(0, reimburseGross - reimburseWithdrawn));

      // 私人收款獨得業績（僅紀錄，不產生應付）
      let privateExclusiveNet = 0;
      (data.activities || []).forEach((a) => {
        if (
          a.status === "confirmed" &&
          a.attribution === "exclusive" &&
          a.exclusiveShareholderId === sh.id &&
          a.paymentLocation === "private"
        ) {
          privateExclusiveNet = money(privateExclusiveNet + activityNetProfit(a));
        }
      });

      return {
        shareholder: sh,
        dividendGross,
        dividendDue,
        exclusiveGross,
        exclusiveDue,
        reimburseGross,
        reimburseDue,
        privateExclusiveNet,
        totalPayable: money(dividendDue + exclusiveDue + reimburseDue),
      };
    });
  }

  /**
   * 人員排班時間表彙總
   */
  function computeRoster(data, { month, staffId } = {}) {
    const rows = [];
    (data.activities || []).forEach((act) => {
      if (month && !String(act.date || "").startsWith(month)) return;
      (act.assignments || []).forEach((as) => {
        if (staffId && as.staffId !== staffId) return;
        const staff = (data.staff || []).find((s) => s.id === as.staffId);
        rows.push({
          activityId: act.id,
          activityName: act.name,
          date: act.date,
          status: act.status,
          attribution: act.attribution,
          staffId: as.staffId,
          staffName: staff?.name || "（未知）",
          startTime: as.startTime || act.startTime,
          endTime: as.endTime || act.endTime,
          wage: money(as.wage),
        });
      });
    });
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startTime).localeCompare(String(b.startTime)));
    return rows;
  }

  function filterActivities(data, filters = {}) {
    return (data.activities || []).filter((a) => {
      if (filters.month && !String(a.date || "").startsWith(filters.month)) return false;
      if (filters.status && filters.status !== "all" && a.status !== filters.status) return false;
      if (filters.attribution && filters.attribution !== "all" && a.attribution !== filters.attribution) return false;
      if (filters.staffId && filters.staffId !== "all") {
        const hit = (a.assignments || []).some((x) => x.staffId === filters.staffId);
        if (!hit) return false;
      }
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const blob = `${a.name} ${a.notes || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }

  function activitiesToCSV(activities, data) {
    const headers = [
      "日期",
      "名稱",
      "狀態",
      "歸屬",
      "獨得股東",
      "收款位置",
      "收入",
      "直接成本",
      "人工",
      "淨利潤",
      "備註",
    ];
    const lines = [headers.join(",")];
    activities.forEach((a) => {
      const sh = (data.shareholders || []).find((x) => x.id === a.exclusiveShareholderId);
      const row = [
        a.date,
        csvEscape(a.name),
        a.status === "confirmed" ? "已確認" : "暫時確認",
        a.attribution === "company" ? "公數" : "獨得",
        csvEscape(sh?.name || ""),
        a.paymentLocation === "company"
          ? "入公數"
          : a.paymentLocation === "private"
            ? "私人收款"
            : "",
        money(a.revenue),
        money(a.directCosts),
        laborTotal(a),
        activityNetProfit(a),
        csvEscape(a.notes || ""),
      ];
      lines.push(row.join(","));
    });
    return lines.join("\n");
  }

  function csvEscape(s) {
    const t = String(s ?? "");
    if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  global.WPCalc = {
    money,
    formatHKD,
    laborTotal,
    activityNetProfit,
    computeKPIs,
    computeShareholderCards,
    computeRoster,
    filterActivities,
    activitiesToCSV,
    downloadText,
  };
})(window);
