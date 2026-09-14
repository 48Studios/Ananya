import { describe, it, expect } from "vitest";
import React from "react";
import { extractSelectItems } from "./select-utils";

describe("extractSelectItems", () => {
  it("extracts values and labels from simple SelectItem children", () => {
    const jsx = React.createElement(
      "div",
      null,
      React.createElement("div", { value: "FIFO" }, "FIFO (First In First Out)"),
      React.createElement("div", { value: "FEFO" }, "FEFO (First Expired First Out)"),
    );

    const items = extractSelectItems(jsx);
    expect(items).toContainEqual({
      value: "FIFO",
      label: "FIFO (First In First Out)",
    });
    expect(items).toContainEqual({
      value: "FEFO",
      label: "FEFO (First Expired First Out)",
    });
  });

  it("extracts nested SelectItem children within groups", () => {
    const jsx = React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        null,
        React.createElement("div", { value: "warehouse" }, "Warehouse / Facility"),
        React.createElement("div", { value: "dry_cabinet" }, "Dry Cabinet (MSD)"),
      ),
    );

    const items = extractSelectItems(jsx);
    expect(items).toContainEqual({
      value: "warehouse",
      label: "Warehouse / Facility",
    });
    expect(items).toContainEqual({
      value: "dry_cabinet",
      label: "Dry Cabinet (MSD)",
    });
  });

  it("extracts mapped array elements with composite text labels", () => {
    const locations = [
      { id: "loc-1", code: "LOC-01", name: "Central Warehouse" },
      { id: "loc-2", code: "LOC-02", name: "Secondary Bin" },
    ];

    const jsx = React.createElement(
      "div",
      null,
      locations.map((loc) =>
        React.createElement("div", { key: loc.id, value: loc.id }, `${loc.code} — ${loc.name}`),
      ),
    );

    const items = extractSelectItems(jsx);
    expect(items).toContainEqual({
      value: "loc-1",
      label: "LOC-01 — Central Warehouse",
    });
    expect(items).toContainEqual({
      value: "loc-2",
      label: "LOC-02 — Secondary Bin",
    });
  });

  it("supports loose matching by registering numeric and string twins", () => {
    const jsx = React.createElement(
      "div",
      null,
      React.createElement("div", { value: "4" }, "April (Standard Q1)"),
      React.createElement("div", { value: 7 }, "July"),
    );

    const items = extractSelectItems(jsx);
    // string "4" produces string "4" and number 4
    expect(items).toContainEqual({ value: "4", label: "April (Standard Q1)" });
    expect(items).toContainEqual({ value: 4, label: "April (Standard Q1)" });
    // number 7 produces number 7 and string "7"
    expect(items).toContainEqual({ value: 7, label: "July" });
    expect(items).toContainEqual({ value: "7", label: "July" });
  });

  it("prioritizes explicit label prop if provided", () => {
    const jsx = React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        { value: "LOW", label: "Low Priority" },
        "LOW (Fallback text)",
      ),
    );

    const items = extractSelectItems(jsx);
    expect(items).toContainEqual({
      value: "LOW",
      label: "Low Priority",
    });
  });
});
