import { describe, expect, it } from "vitest";
import { detectColumns, linesToLeads, parseCsv, rowsToLeads, safeCell } from "../src/lib/csv";

const SAASQUATCH = `Company,Industry,Address,BBB Rating,Company Phone,Website,Estimated Revenue
Scale AI,Software company,"650 Townsend St, San Francisco CA",N/A,(415) 555-0100,scale.com,300M
Actnet Computer,Computers & Computer Equipment,"2207 Judah St, San Francisco CA",N/A,N/A,actnetonline.com,500k`;

describe("CSV import", () => {
  it("auto-maps SaaSquatch's exact export columns", () => {
    const { headers } = parseCsv(SAASQUATCH);
    expect(detectColumns(headers)).toMatchObject({ name: "Company", industry: "Industry", address: "Address", phone: "Company Phone", website: "Website", revenue: "Estimated Revenue", bbb: "BBB Rating" });
  });

  it("normalises values, treats N/A as empty and recovers city/state from the address", () => {
    const { headers, rows } = parseCsv(SAASQUATCH);
    const leads = rowsToLeads(rows, detectColumns(headers));
    expect(leads[0]).toMatchObject({ name: "Scale AI", domain: "scale.com", phone: "+14155550100", city: "San Francisco", region: "CA" });
    expect(leads[1].phone).toBeUndefined();
    expect(leads[0].imported?.revenue).toBe("300M");
  });

  it("parses pasted domains, URLs and emails, skipping platforms and duplicates", () => {
    const leads = linesToLeads("acme.com\nhttps://www.acme.com/about\nowner@bobsroofing.com, facebook.com/joes");
    expect(leads.map((l) => l.domain)).toEqual(["acme.com", "bobsroofing.com"]);
  });
});

describe("CSV export safety", () => {
  it("neutralises spreadsheet formula injection", () => {
    expect(safeCell("=HYPERLINK(\"evil\")")).toBe("'=HYPERLINK(\"evil\")");
    expect(safeCell("+1 512")).toBe("'+1 512");
    expect(safeCell("Acme")).toBe("Acme");
  });
});
