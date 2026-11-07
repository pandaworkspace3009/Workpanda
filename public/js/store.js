/**
 * WorkPanda 資料層：雲端 Postgres API 即時同步（跨裝置）+ LocalStorage 後備
 */
(function (global) {
  const STORAGE_KEY = "workpanda_v2_data";
  const MODE_KEY = "workpanda_v2_mode";
  const API_URL = "/api/workspace";
  const POLL_MS = 2500;

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function seedData() {
    const sh1 = uid("sh");
    const sh2 = uid("sh");
    const st1 = uid("st");
    const st2 = uid("st");
    const st3 = uid("st");
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const day = `${y}-${m}-${d}`;

    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 5);
    const holdDay = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, "0")}-${String(nextWeek.getDate()).padStart(2, "0")}`;

    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 3);
    const doneDay = `${lastWeek.getFullYear()}-${String(lastWeek.getMonth() + 1).padStart(2, "0")}-${String(lastWeek.getDate()).padStart(2, "0")}`;

    const a1 = uid("act");
    const a2 = uid("act");
    const a3 = uid("act");

    return {
      version: 2,
      settings: { bufferAmount: 20000, companyName: "WorkPanda" },
      shareholders: [
        { id: sh1, name: "陳大文", sharePercent: 60 },
        { id: sh2, name: "李小美", sharePercent: 40 },
      ],
      staff: [
        { id: st1, name: "陳大文", shareholderId: sh1 },
        { id: st2, name: "李小美", shareholderId: sh2 },
        { id: st3, name: "阿強（兼職）", shareholderId: null },
      ],
      activities: [
        {
          id: a1,
          name: "中環企業活動佈置",
          date: doneDay,
          startTime: "09:00",
          endTime: "18:00",
          notes: "客人要求早到一小時",
          revenue: 18000,
          directCosts: 2500,
          status: "confirmed",
          attribution: "company",
          exclusiveShareholderId: null,
          paymentLocation: null,
          assignments: [
            { id: uid("as"), staffId: st1, wage: 2000, startTime: "09:00", endTime: "18:00" },
            { id: uid("as"), staffId: st3, wage: 1200, startTime: "10:00", endTime: "18:00" },
          ],
        },
        {
          id: a2,
          name: "私人派對攝影（獨得）",
          date: day,
          startTime: "14:00",
          endTime: "20:00",
          notes: "李小美私人客",
          revenue: 8000,
          directCosts: 500,
          status: "confirmed",
          attribution: "exclusive",
          exclusiveShareholderId: sh2,
          paymentLocation: "company",
          assignments: [
            { id: uid("as"), staffId: st2, wage: 1500, startTime: "14:00", endTime: "20:00" },
          ],
        },
        {
          id: a3,
          name: "沙田商場路演（Hold）",
          date: holdDay,
          startTime: "11:00",
          endTime: "17:00",
          notes: "待客人確認預算",
          revenue: 12000,
          directCosts: 1800,
          status: "tentative",
          attribution: "company",
          exclusiveShareholderId: null,
          paymentLocation: null,
          assignments: [
            { id: uid("as"), staffId: st3, wage: 1000, startTime: "11:00", endTime: "17:00" },
          ],
        },
      ],
      ledger: [
        {
          id: uid("led"),
          date: `${y}-${m}-01`,
          type: "expense",
          category: "租金",
          description: "工作室月租",
          amount: 8000,
          activityId: null,
          autoSynced: false,
          paymentStatus: "paid",
          paymentSource: "company",
          reimbursedByShareholderId: null,
        },
        {
          id: uid("led"),
          date: doneDay,
          type: "expense",
          category: "廣告",
          description: "Facebook 廣告",
          amount: 600,
          activityId: null,
          autoSynced: false,
          paymentStatus: "pending",
          paymentSource: "shareholder",
          reimbursedByShareholderId: sh1,
        },
      ],
      settlements: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  class WorkPandaStore {
    constructor() {
      this.data = null;
      this.mode = "cloud";
      this.listeners = new Set();
      this.updatedAt = null;
      this.sampleData = true;
      this.cloudReady = false;
      this.lastError = null;
      this._pollTimer = null;
      this._saving = false;
    }


    _headers(json) {
      const h = {};
      if (json) h["content-type"] = "application/json";
      return h;
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    notify() {
      this.listeners.forEach((fn) => {
        try {
          fn(this.data);
        } catch (e) {
          console.error(e);
        }
      });
    }

    getMode() {
      return this.mode;
    }

    async init() {
      const saved = localStorage.getItem(MODE_KEY);
      this.mode = saved === "local" ? "local" : "cloud";
      if (this.mode === "cloud") {
        try {
          await this._pullCloud(true);
          this._startPoll();
          return;
        } catch (e) {
          console.warn("雲端同步失敗，回退本機", e);
          this.lastError = e.message || String(e);
          this.mode = "local";
          localStorage.setItem(MODE_KEY, "local");
        }
      }
      this._loadLocal();
    }

    _startPoll() {
      this._stopPoll();
      this._pollTimer = setInterval(() => {
        if (this.mode !== "cloud" || this._saving) return;
        this._pullCloud(false).catch(() => {});
      }, POLL_MS);
    }

    _stopPoll() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    }

    async _pullCloud(force) {
      const res = await fetch(API_URL, {
        method: "GET",
        headers: this._headers(false),
        cache: "no-store",
      });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.hint || "未授權：請以 Private／Team 發佈並用 Cursor 登入各裝置");
      }
      if (!res.ok) throw new Error(`雲端讀取失敗 (${res.status})`);
      const body = await res.json();
      this.cloudReady = true;
      this.sampleData = Boolean(body.sampleData);
      this.lastError = null;
      if (!force && body.updatedAt && body.updatedAt === this.updatedAt) return;
      this.updatedAt = body.updatedAt;
      this.data = body.data;
      this._ensureLedgerSync();
      // mirror for offline
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this.notify();
    }

    async _pushCloud() {
      this._saving = true;
      try {
        const res = await fetch(API_URL, {
          method: "PUT",
          headers: this._headers(true),
          cache: "no-store",
          body: JSON.stringify({
            data: this.data,
            expectedUpdatedAt: this.updatedAt,
          }),
        });
        if (res.status === 401) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.hint || "未授權：無法寫入雲端");
        }
        if (res.status === 409) {
          const body = await res.json();
          this.updatedAt = body.updatedAt;
          this.data = body.data;
          this._ensureLedgerSync();
          this.notify();
          throw new Error("其他裝置剛更新咗資料，已載入最新版本，請再試一次");
        }
        if (!res.ok) throw new Error(`雲端寫入失敗 (${res.status})`);
        const body = await res.json();
        this.updatedAt = body.updatedAt;
        this.data = body.data;
        this.sampleData = Boolean(body.sampleData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } finally {
        this._saving = false;
      }
    }

    _loadLocal() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          this.data = JSON.parse(raw);
        } catch {
          this.data = seedData();
        }
      } else {
        this.data = seedData();
        this._saveLocal();
      }
      this._ensureLedgerSync();
      this.notify();
    }

    _saveLocal() {
      this.data.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    }

    async setMode(mode) {
      if (mode === "cloud") {
        this.mode = "cloud";
        localStorage.setItem(MODE_KEY, "cloud");
        await this._pullCloud(true);
        this._startPoll();
        return;
      }
      this._stopPoll();
      this.mode = "local";
      localStorage.setItem(MODE_KEY, "local");
      if (!this.data) this.data = seedData();
      this._saveLocal();
      this.notify();
    }

    async persist() {
      this._ensureLedgerSync();
      if (this.mode === "cloud") {
        this.data.updatedAt = new Date().toISOString();
        await this._pushCloud();
        this.notify();
        return;
      }
      this._saveLocal();
      this.notify();
    }

    _ensureLedgerSync() {
      if (!this.data) return;
      const acts = this.data.activities || [];
      const keepIds = new Set();

      acts.forEach((act) => {
        const isExclusive = act.attribution === "exclusive";
        const labor = (act.assignments || []).reduce((s, a) => s + Number(a.wage || 0), 0);

        const costId = `auto_cost_${act.id}`;
        keepIds.add(costId);
        this._upsertAutoLedger({
          id: costId,
          date: act.date,
          type: "expense",
          category: "活動直接成本",
          description: `[自動連動] ${act.name} — 物資／運輸`,
          amount: Number(act.directCosts || 0),
          activityId: act.id,
          autoSynced: true,
          paymentStatus: act.status === "confirmed" ? "pending" : "pending",
          paymentSource: isExclusive ? "exclusive_internal" : "company",
          reimbursedByShareholderId: null,
          tentative: act.status === "tentative",
        });

        const laborId = `auto_labor_${act.id}`;
        keepIds.add(laborId);
        this._upsertAutoLedger({
          id: laborId,
          date: act.date,
          type: "expense",
          category: "排班人工",
          description: `[自動連動] ${act.name} — 排班人工`,
          amount: labor,
          activityId: act.id,
          autoSynced: true,
          paymentStatus: "pending",
          paymentSource: isExclusive ? "exclusive_internal" : "company",
          reimbursedByShareholderId: null,
          tentative: act.status === "tentative",
        });

        const incomeId = `auto_income_${act.id}`;
        keepIds.add(incomeId);
        const countsAsCompanyCash =
          act.attribution === "company" ||
          (act.attribution === "exclusive" && act.paymentLocation === "company");
        this._upsertAutoLedger({
          id: incomeId,
          date: act.date,
          type: "income",
          category: "活動收入",
          description: `[自動連動] ${act.name} — 訂單收入`,
          amount: countsAsCompanyCash ? Number(act.revenue || 0) : 0,
          activityId: act.id,
          autoSynced: true,
          paymentStatus: "paid",
          paymentSource: isExclusive && act.paymentLocation === "private" ? "private" : "company",
          reimbursedByShareholderId: null,
          tentative: act.status === "tentative",
          hidden: !countsAsCompanyCash || Number(act.revenue || 0) === 0,
        });
      });

      this.data.ledger = (this.data.ledger || []).filter((e) => {
        if (!e.autoSynced) return true;
        return keepIds.has(e.id) || (e.activityId && acts.some((a) => a.id === e.activityId));
      });
      this.data.ledger = this.data.ledger.filter((e) => !e.autoSynced || keepIds.has(e.id));
    }

    _upsertAutoLedger(entry) {
      const list = this.data.ledger || (this.data.ledger = []);
      const idx = list.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        const prev = list[idx];
        list[idx] = {
          ...entry,
          paymentStatus: prev.paymentStatus || entry.paymentStatus,
          paymentSource:
            entry.paymentSource === "exclusive_internal" || entry.paymentSource === "private"
              ? entry.paymentSource
              : prev.paymentSource || entry.paymentSource,
          reimbursedByShareholderId:
            entry.paymentSource === "exclusive_internal"
              ? null
              : prev.reimbursedByShareholderId ?? entry.reimbursedByShareholderId,
        };
      } else {
        list.push(entry);
      }
    }

    get() {
      return this.data;
    }

    async update(mutator) {
      mutator(this.data);
      await this.persist();
    }

    async saveActivity(activity) {
      const list = this.data.activities;
      const idx = list.findIndex((a) => a.id === activity.id);
      if (idx >= 0) list[idx] = activity;
      else list.push(activity);
      await this.persist();
    }

    async deleteActivity(id) {
      this.data.activities = this.data.activities.filter((a) => a.id !== id);
      await this.persist();
    }

    async saveLedger(entry) {
      const list = this.data.ledger;
      const idx = list.findIndex((e) => e.id === entry.id);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      await this.persist();
    }

    async deleteLedger(id) {
      const e = this.data.ledger.find((x) => x.id === id);
      if (e && e.autoSynced) throw new Error("自動連動紀錄請於活動中修改");
      this.data.ledger = this.data.ledger.filter((x) => x.id !== id);
      await this.persist();
    }

    async saveShareholder(sh) {
      const list = this.data.shareholders;
      const idx = list.findIndex((x) => x.id === sh.id);
      if (idx >= 0) list[idx] = sh;
      else list.push(sh);
      await this.persist();
    }

    async deleteShareholder(id) {
      this.data.shareholders = this.data.shareholders.filter((x) => x.id !== id);
      await this.persist();
    }

    async saveStaff(st) {
      const list = this.data.staff;
      const idx = list.findIndex((x) => x.id === st.id);
      if (idx >= 0) list[idx] = st;
      else list.push(st);
      await this.persist();
    }

    async deleteStaff(id) {
      this.data.staff = this.data.staff.filter((x) => x.id !== id);
      await this.persist();
    }

    async addSettlement(rec) {
      this.data.settlements.push(rec);
      await this.persist();
    }

    async resetDemo() {
      this.data = seedData();
      await this.persist();
    }

    exportJSON() {
      return JSON.stringify(this.data, null, 2);
    }

    async importJSON(text) {
      const parsed = JSON.parse(text);
      if (!parsed.activities || !parsed.shareholders) throw new Error("無效備份檔");
      this.data = parsed;
      await this.persist();
    }
  }

  global.WorkPandaStore = WorkPandaStore;
  global.wpUid = uid;
  global.wpClone = clone;
})(window);
