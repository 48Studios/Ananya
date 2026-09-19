import { describe, expect, it } from "vitest";
import { Manufacturer } from "./manufacturer";

describe("Manufacturer", () => {
  it("normalizes new and updated manufacturer codes to uppercase", () => {
    const manufacturer = Manufacturer.create({
      code: "yageo",
      name: "Yageo",
    });

    expect(manufacturer.code).toBe("YAGEO");
    expect(manufacturer.update({ code: "vishay" }).code).toBe("VISHAY");
  });
});