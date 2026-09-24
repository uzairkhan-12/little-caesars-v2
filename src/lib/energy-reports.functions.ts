import { createServerFn } from "@tanstack/react-start";
import { REPORT_TABLES, type ReportTable } from "./energy-devices";

function isReportTable(v: string): v is ReportTable {
  return (REPORT_TABLES as readonly string[]).includes(v);
}

export const getEnergyReports = createServerFn({ method: "GET" })
  .validator((d: { table: ReportTable }) => d)
  .handler(async ({ data }) => {
    await (await import("./gate.server")).assertAdmin();
    const { listEnergyReports } = await import("./energy-reports.server");
    if (!isReportTable(data.table)) return [];
    return listEnergyReports(data.table);
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
