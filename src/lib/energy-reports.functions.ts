import { createServerFn } from "@tanstack/react-start";
import { REPORT_TABLES, type ReportTable } from "./energy-devices";

function isReportTable(v: string): v is ReportTable {
  return (REPORT_TABLES as readonly string[]).includes(v);
}

/** `all` or a missing table means every load. An unknown name returns null. */
function tableFilter(table?: string): ReportTable | undefined | null {
  if (!table || table === "all") return undefined;
  return isReportTable(table) ? table : null;
}

export const getEnergyReports = createServerFn({ method: "GET" })
  .validator((d: { table?: ReportTable | "all" }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertAdmin();
    const { listEnergyReports } = await import("./energy-reports.server");
    const table = tableFilter(data.table);
    if (table === null) return [];
    return listEnergyReports(table);
  });

export const getMidnightEnergyReports = createServerFn({ method: "GET" })
  .validator((d: { table?: ReportTable | "all" }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertAdmin();
    const { listMidnightEnergyReports } = await import("./energy-reports.server");
    const table = tableFilter(data.table);
    if (table === null) return [];
    return listMidnightEnergyReports(table);
  });

export const getHourlyEnergyReports = createServerFn({ method: "GET" })
  .validator((d: { table?: ReportTable | "all" }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertAdmin();
    const { listHourlyEnergyReports } = await import("./energy-reports.server");
    const table = tableFilter(data.table);
    if (table === null) return [];
    return listHourlyEnergyReports(table);
  });

export const getAcQuarterReports = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertAdmin();
  const { listAcQuarterReports } = await import("./energy-reports.server");
  return listAcQuarterReports();
});

export const getAcQuarterBaselines = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const { getAcQuarterBaselines: load } = await import("./energy-reports.server");
  return load();
});

export const getHourlyBaselines = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const { getHourlyBaselines: load } = await import("./energy-reports.server");
  return load();
});

export const getMidnightBaselines = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const { getMidnightBaselines: load } = await import("./energy-reports.server");
  return load();
});

export const getEnergyBaselines = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const { getEnergyBaselines: load } = await import("./energy-reports.server");
  return load();
});

export const getEnergyOverview = createServerFn({ method: "GET" }).handler(async () => {
  await (await import("./gate.server")).assertUnlocked();
  const { getEnergyOverview: load } = await import("./energy-reports.server");
  return load();
});
