import { describe, expect, it } from "vitest";
import {
  Component,
  ComponentSkuAlreadyExistsError,
  CreateComponent,
  formatComponentSku,
  normalizeComponentSku,
  UpdateComponent,
  type ComponentRepository,
  type ComponentSkuGenerator,
} from "./index";

function createRepository(
  existing: Component[] = [],
): ComponentRepository & { saved: Component[] } {
  const saved = [...existing];
  return {
    saved,
    async findById(id) {
      return saved.find((component) => component.id === id) ?? null;
    },
    async findBySku(sku) {
      return saved.find((component) => component.sku === sku) ?? null;
    },
    async findMany() {
      return saved;
    },
    async save(component) {
      if (saved.some((item) => item.sku === component.sku)) {
        throw new ComponentSkuAlreadyExistsError(component.sku);
      }
      saved.push(component);
      return component;
    },
    async update(component) {
      const index = saved.findIndex((item) => item.id === component.id);
      saved[index] = component;
      return component;
    },
    async delete(id) {
      const index = saved.findIndex((item) => item.id === id);
      saved.splice(index, 1);
    },
  };
}

const input = {
  name: "10k resistor",
  unit: "pcs",
  manufacturerId: "manufacturer-1",
  categoryId: "category-1",
};

describe("component SKU generation", () => {
  it("normalizes explicit SKUs and formats deterministic sequences", () => {
    expect(normalizeComponentSku(" res-10k-001 ")).toBe("RES-10K-001");
    expect(formatComponentSku(1)).toBe("CMP-000001");
    expect(formatComponentSku(124, "res-")).toBe("RES-000124");
  });

  it("generates a component SKU when the caller omits one", async () => {
    const repository = createRepository();
    const generator: ComponentSkuGenerator = {
      generate: async () => "CMP-000001",
    };

    const component = await new CreateComponent(repository, generator).execute(
      input,
    );

    expect(component.sku).toBe("CMP-000001");
  });

  it("retries a generated candidate after a database uniqueness collision", async () => {
    const repository = createRepository();
    const candidates = ["CMP-000001", "CMP-000002"];
    let saves = 0;
    const originalSave = repository.save;
    repository.save = async (component) => {
      saves++;
      if (saves === 1) {
        throw new ComponentSkuAlreadyExistsError(component.sku);
      }
      return originalSave(component);
    };

    const component = await new CreateComponent(repository, {
      generate: async () => candidates[saves]!,
    }).execute(input);

    expect(component.sku).toBe("CMP-000002");
    expect(saves).toBe(2);
  });

  it("keeps the SKU stable when editable fields change", async () => {
    const repository = createRepository();
    const component = await new CreateComponent(repository).execute({
      ...input,
      sku: " res-10k-001 ",
    });

    const updated = await new UpdateComponent(repository).execute(component.id, {
      name: "Updated resistor",
      manufacturerId: "manufacturer-2",
      categoryId: "category-2",
      unit: "box",
    });

    expect(updated.sku).toBe("RES-10K-001");
    expect(updated.name).toBe("Updated resistor");
  });
});