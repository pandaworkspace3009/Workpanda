/**
 * WorkPanda 資料層：LocalStorage（預設）+ Firebase Firestore 切換
 */
(function (global) {
  const STORAGE_KEY = "workpanda_v2_data";
  const MODE_KEY = "workpanda_v2_mode";

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
      settings: {
        bufferAmount: 20000,
        companyName: "WorkPanda",
      },
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
      this.mode = this._resolveInitialMode();
      this.listeners = new Set();
      this.firebaseReady = false;
      this._unsub = null;
    }

    _isConfigured() {
      return Boolean(global.isFirebaseConfigured && global.isFirebaseConfigured());
    }

    /** 有完整 Firebase 憑證時預設雲端同步；用戶曾選 LocalStorage 則尊重 */
    _resolveInitialMode() {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "local" || saved === "firebase") return saved;
      return this._isConfigured() ? "firebase" : "local";
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
      this.mode = this._resolveInitialMode();
      if (this.mode === "firebase") {
        if (this._isConfigured()) {
          try {
            await this._initFirebase();
            localStorage.setItem(MODE_KEY, "firebase");
            return;
          } catch (e) {
            console.warn("Firebase 初始化失敗，回退 LocalStorage", e);
          }
        }
        // 雲端不可用時回退本機；用戶可於設定再切回 Firestore
        this.mode = "local";
        localStorage.setItem(MODE_KEY, "local");
      }
      if (!localStorage.getItem(MODE_KEY)) localStorage.setItem(MODE_KEY, "local");
      this._loadLocal();
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

    async _initFirebase() {
      if (!global.firebase) throw new Error("Firebase SDK 未載入");
      if (!firebase.apps.length) {
        firebase.initializeApp(global.FIREBASE_CONFIG);
      }
      this.db = firebase.firestore();
      this.firebaseReady = true;
      const docRef = this.db.collection("workpanda").doc("main");
      const snap = await docRef.get();
      if (!snap.exists) {
        this.data = seedData();
        await docRef.set(this.data);
      } else {
        this.data = snap.data();
      }
      this._ensureLedgerSync();
      this.notify();
      if (this._unsub) this._unsub();
      this._unsub = docRef.onSnapshot((s) => {
        if (s.exists) {
          this.data = s.data();
          this.notify();
        }
      });
    }

    async setMode(mode) {
      if (mode === "firebase") {
        if (!this._isConfigured()) {
          throw new Error("請先於 firebase-config.js 填入 Firebase 憑證");
        }
        this.mode = "firebase";
        localStorage.setItem(MODE_KEY, "firebase");
        await this._initFirebase();
        return;
      }
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
      this.mode = "local";
      localStorage.setItem(MODE_KEY, "local");
      // 從目前記憶體資料寫入 local，方便離線繼續
      if (!this.data) this.data = seedData();
      this._saveLocal();
      this.notify();
    }

    async persist() {
      this._ensureLedgerSync();
      if (this.mode === "firebase" && this.firebaseReady) {
        this.data.updatedAt = new Date().toISOString();
        await this.db.collection("workpanda").doc("main").set(this.data);
      } else {
        this._saveLocal();
      }
      this.notify();
    }

    /**
     * 自動連動：活動之直接成本與排班人工 → ledger（綁定 activityId）
     * 獨得單成本標記 paymentSource=exclusive_internal，唔入公數
     */
    _ensureLedgerSync() {
      if (!this.data) return;
      const acts = this.data.activities || [];
      const keepIds = new Set();

      acts.forEach((act) => {
        const isExclusive = act.attribution === "exclusive";
        const labor = (act.assignments || []).reduce((s, a) => s + Number(a.wage || 0), 0);

        // 直接成本
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

        // 人工
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

        // 收入（僅公數單／獨得但入公數戶口）才寫入公數現金流
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

      // 移除已刪活動的自動連動紀錄
      this.data.ledger = (this.data.ledger || []).filter((e) => {
        if (!e.autoSynced) return true;
        return keepIds.has(e.id) || (e.activityId && acts.some((a) => a.id === e.activityId));
      });
      // 再過濾：只保留 keepIds 內之自動紀錄
      this.data.ledger = this.data.ledger.filter((e) => !e.autoSynced || keepIds.has(e.id));
    }

    _upsertAutoLedger(entry) {
      const list = this.data.ledger || (this.data.ledger = []);
      const idx = list.findIndex((e) => e.id === entry.id);
      // 保留用戶已改過的出糧狀態／付款來源（非 exclusive_internal）
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

    // --- CRUD helpers ---
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
