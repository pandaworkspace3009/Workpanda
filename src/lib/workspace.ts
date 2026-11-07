import { sql } from "./db";

export const WORKSPACE_ID = "main";

export type WorkspacePayload = Record<string, unknown> & {
  version?: number;
  updatedAt?: string;
};

export function seedWorkspace(): WorkspacePayload {
  const uid = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

type WorkspaceRow = {
  id: string;
  payload: WorkspacePayload;
  updated_at: string | Date;
  updated_by: string | null;
};

export async function getOrCreateWorkspace(): Promise<{
  payload: WorkspacePayload;
  updatedAt: string;
  updatedBy: string | null;
}> {
  const rows = await sql<WorkspaceRow>(
    "select id, payload, updated_at, updated_by from workspace where id = $1",
    [WORKSPACE_ID],
  );
  if (rows.length === 0) {
    const payload = seedWorkspace();
    const updatedAt = payload.updatedAt || new Date().toISOString();
    await sql(
      "insert into workspace (id, payload, updated_at, updated_by) values ($1, $2::jsonb, $3::timestamptz, $4)",
      [WORKSPACE_ID, JSON.stringify(payload), updatedAt, "system:seed"],
    );
    return { payload, updatedAt, updatedBy: "system:seed" };
  }
  const row = rows[0];
  const updatedAt =
    typeof row.updated_at === "string"
      ? row.updated_at
      : new Date(row.updated_at).toISOString();
  const payload =
    typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return { payload, updatedAt, updatedBy: row.updated_by };
}

export async function saveWorkspace(
  payload: WorkspacePayload,
  actor: string,
  expectedUpdatedAt?: string | null,
): Promise<{ payload: WorkspacePayload; updatedAt: string } | { conflict: true; payload: WorkspacePayload; updatedAt: string }> {
  const current = await getOrCreateWorkspace();
  if (expectedUpdatedAt && expectedUpdatedAt !== current.updatedAt) {
    return { conflict: true, payload: current.payload, updatedAt: current.updatedAt };
  }
  const updatedAt = new Date().toISOString();
  const next = { ...payload, updatedAt };
  await sql(
    `insert into workspace (id, payload, updated_at, updated_by)
     values ($1, $2::jsonb, $3::timestamptz, $4)
     on conflict (id) do update set
       payload = excluded.payload,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
    [WORKSPACE_ID, JSON.stringify(next), updatedAt, actor],
  );
  return { payload: next, updatedAt };
}
