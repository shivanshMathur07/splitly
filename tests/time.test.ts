import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, formatDateIST, formatDateTimeIST, istDate, monthStartIST, parseInstant, timeAgoIST, todayIST, yearStartIST } from "../src/lib/time";

afterEach(() => vi.useRealTimers());

describe("IST calendar dates", () => {
  it("00:15 IST is still the previous day in UTC but today in India", () => {
    const at = new Date("2026-11-27T18:45:00Z"); // = 28 Nov 2026, 00:15 IST
    expect(at.toISOString().slice(0, 10)).toBe("2026-11-27"); // the old bug
    expect(todayIST(at)).toBe("2026-11-28");
  });
  it("handles the 05:30 boundary exactly", () => {
    expect(istDate(new Date("2026-11-27T18:29:59Z"))).toBe("2026-11-27");
    expect(istDate(new Date("2026-11-27T18:30:00Z"))).toBe("2026-11-28");
  });
  it("rolls months and years over in IST", () => {
    const newYearIST = new Date("2026-12-31T19:00:00Z"); // 1 Jan 2027, 00:30 IST
    expect(todayIST(newYearIST)).toBe("2027-01-01");
    expect(monthStartIST(newYearIST)).toBe("2027-01-01");
    expect(yearStartIST(newYearIST)).toBe("2027-01-01");
    expect(monthStartIST(new Date("2026-11-30T20:00:00Z"))).toBe("2026-12-01");
  });
  it("uses the fake system clock by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T20:00:00Z")); // 1 Apr 01:30 IST
    expect(todayIST()).toBe("2026-04-01");
  });
  it("adds days on calendar dates without timezone drift", () => {
    expect(addDays("2026-11-28", -29)).toBe("2026-10-30");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("formatting in IST", () => {
  it("prints calendar dates as-is, whatever the runtime timezone", () => {
    expect(formatDateIST("2026-11-28")).toBe("28 Nov 2026");
    expect(formatDateIST("2026-01-01")).toBe("1 Jan 2026");
  });
  it("converts stored UTC instants to the IST date", () => {
    expect(formatDateIST("2026-11-27 18:45:00")).toBe("28 Nov 2026");
    expect(formatDateIST("2026-11-27 18:00:00")).toBe("27 Nov 2026");
  });
  it("formats an instant with IST time of day", () => {
    expect(formatDateTimeIST("2026-11-27 18:45:00")).toBe("28 Nov 2026, 12:15 am IST");
    expect(formatDateTimeIST(new Date("2026-11-28T08:00:00Z"))).toBe("28 Nov 2026, 1:30 pm IST");
  });
  it("parses stored SQL text as UTC, and accepts ISO with offsets", () => {
    expect(parseInstant("2026-11-27 18:45:00").toISOString()).toBe("2026-11-27T18:45:00.000Z");
    expect(parseInstant("2026-11-28T00:15:00+05:30").toISOString()).toBe("2026-11-27T18:45:00.000Z");
    expect(() => parseInstant("2026-11-28")).toThrow();
  });
  it("relative times fall back to the IST date after a week", () => {
    const now = new Date("2026-11-28T10:00:00Z");
    expect(timeAgoIST("2026-11-28 09:59:30", now)).toBe("just now");
    expect(timeAgoIST("2026-11-28 07:00:00", now)).toBe("3h ago");
    expect(timeAgoIST("2026-11-10 18:45:00", now)).toBe("11 Nov 2026");
  });
});
