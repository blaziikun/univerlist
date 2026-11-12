// @vitest-environment happy-dom
// Local days, west of UTC: 10 pm in New York is already tomorrow in UTC (see local-days.ts).
import { vi } from "vitest";

vi.hoisted(() => {
    process.env.TZ = "America/New_York";
});
import { localDays } from "./local-days";

localDays("America/New_York", {
    now: "2026-05-15T22:00:00-04:00",
    edge: "2026-03-02T03:00:00Z", // 10 pm on 1 March in New York
    edgeDay: "2026-03-01",
    streak2: ["2026-05-16T01:00:00Z", "2026-05-14T16:00:00Z"],
    streak1: ["2026-05-16T01:00:00Z", "2026-05-15T12:00:00Z"], // 9 pm and 8 am on the 15th: two UTC days
    month: "2026-04-01T02:00:00Z", // 10 pm on 31 March in New York
    monthLabel: "Mar",
});
