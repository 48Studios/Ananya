import { describe, expect, it } from "vitest";
import { ComponentSkuAlreadyExistsError } from "./component.errors";
import { CreateComponent } from "./create-component";
import type { ComponentRepository } from "./component.repository";

function repository(): ComponentRepository & { savedSku?: string } {
  const state: ComponentRepository & { savedSku?: string } = {
    async findById() {
      return null;
    },
    async findBySku() {
      return null;
    },
    async findMany() {
      return [];
    },
    async save(component) {
      state.savedSku = component.sku;
      return component;
    },
    async update(component) {
      return component;
    },
    async delete() {},
  };
  return state;
}

describe("CreateComponent", () => {
  it("allocates a SKU when the input omits one", async () => {
    const components = repository();
    const useCase = new CreateComponent(components, {
      generate: async () => "CMP-000123",
    });

    const created = await useCase.execute({
      name: "27 ohm resistor",
      unit: "pcs",
    });

    expect(created.sku).toBe("CMP-000123");
    expect(components.savedSku).toBe("CMP-000123");
  });

  it("retries a generated SKU after a uniqueness collision", async () => {
    const components = repository();
    let saves = 0;
    components.save = async (component) => {
      saves += 1;
      if (saves === 1) throw new ComponentSkuAlreadyExistsError(component.sku);
      components.savedSku = component.sku;
      return component;
    };

    const candidates = ["CMP-000123", "CMP-000124"];
    const created = await new CreateComponent(components, {
      generate: async () => candidates[saves]!,
    }).execute({
      name: "27 ohm resistor",
      unit: "pcs",
    });

    expect(created.sku).toBe("CMP-000124");
    expect(saves).toBe(2);
  });

  it("treats a frontend CMP preview as a candidate, not a permanent reservation", async () => {
    const components = repository();
    let saves = 0;
    components.save = async (component) => {
      saves += 1;
      if (saves === 1) throw new ComponentSkuAlreadyExistsError(component.sku);
      components.savedSku = component.sku;
      return component;
    };

    const created = await new CreateComponent(components, {
      generate: async () => "CMP-000125",
    }).execute({
      sku: "CMP-000124",
      name: "27 ohm resistor",
      unit: "pcs",
    });

    expect(created.sku).toBe("CMP-000125");
    expect(saves).toBe(2);
  });
});
