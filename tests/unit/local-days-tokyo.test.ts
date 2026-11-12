// @vitest-environment happy-dom
// Local days, east of UTC: 8 am in Tokyo is still yesterday in UTC (see local-days.ts).
import { vi } from "vitest";

vi.hoisted(() => {
    process.env.TZ = "Asia/Tokyo";
});
import { localDays } from "./local-days";

localDays("Asia/Tokyo", {
    now: "2026-05-15T08:00:00+09:00",
    edge: "2026-03-01T16:00:00Z", // 1 am on 2 March in Tokyo
    edgeDay: "2026-03-02",
    streak2: ["2026-05-14T22:00:00Z", "2026-05-14T01:00:00Z"], // 7 am on the 15th and 10 am on the 14th: one UTC day
    streak1: ["2026-05-14T22:00:00Z"],
    month: "2026-03-15T03:00:00Z",
    monthLabel: "Mar",
});
