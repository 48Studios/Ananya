import { describe, it, expect, beforeEach } from "vitest";
import { Unit } from "./unit";
import { CreateUnit } from "./create-unit";
import { UpdateUnit } from "./update-unit";
import { DeleteUnit } from "./delete-unit";
import {
  UnitNameAlreadyExistsError,
  UnitNotFoundError,
  InvalidUnitNameError,
  InvalidUnitCategoryError,
} from "./unit.errors";
import type { UnitRepository } from "./unit.repository";

class InMemoryUnitRepository implements UnitRepository {
  private units = new Map<string, Unit>();

  async findById(id: string): Promise<Unit | null> {
    return this.units.get(id) || null;
  }

  async findByName(name: string): Promise<Unit | null> {
    for (const unit of this.units.values()) {
      if (unit.name.toLowerCase() === name.toLowerCase()) {
        return unit;
      }
    }
    return null;
  }

  async findByCategory(category: string): Promise<Unit[]> {
    return Array.from(this.units.values()).filter(
      (u) => u.category.toLowerCase() === category.toLowerCase(),
    );
  }

  async findMany(): Promise<Unit[]> {
    return Array.from(this.units.values());
  }

  async save(unit: Unit): Promise<Unit> {
    this.units.set(unit.id, unit);
    return unit;
  }

  async update(unit: Unit): Promise<Unit> {
    this.units.set(unit.id, unit);
    return unit;
  }

  async delete(id: string): Promise<void> {
    this.units.delete(id);
  }
}

describe("Unit Domain Module", () => {
  let repo: InMemoryUnitRepository;

  beforeEach(() => {
    repo = new InMemoryUnitRepository();
  });

  describe("Unit Aggregate Invariants", () => {
    it("should create a base unit successfully", () => {
      const unit = Unit.create({
        name: "pcs",
        category: "Count",
        isBaseUnit: true,
        precision: 0,
      });

      expect(unit.name).toBe("pcs");
      expect(unit.category).toBe("Count");
      expect(unit.isBaseUnit).toBe(true);
      expect(unit.isActive).toBe(true);
      expect(unit.precision).toBe(0);
    });

    it("should create a derived unit with conversion factor", () => {
      const unit = Unit.create({
        name: "doz",
        category: "Count",
        isBaseUnit: false,
        conversionFactor: 12,
        precision: 0,
      });

      expect(unit.isBaseUnit).toBe(false);
      expect(unit.conversionFactor).toBe(12);
      expect(unit.convertToBase(2)).toBe(24);
      expect(unit.convertFromBase(36)).toBe(3);
    });

    it("should throw error if non-base unit is missing conversion factor", () => {
      expect(() =>
        Unit.create({
          name: "box",
          category: "Count",
          isBaseUnit: false,
          precision: 0,
        }),
      ).toThrow(InvalidUnitCategoryError);
    });

    it("should throw error if conversion factor <= 0", () => {
      expect(() =>
        Unit.create({
          name: "box",
          category: "Count",
          isBaseUnit: false,
          conversionFactor: -1,
          precision: 0,
        }),
      ).toThrow(InvalidUnitCategoryError);
    });
  });

  describe("CreateUnit Use Case", () => {
    it("should create and persist a new unit", async () => {
      const useCase = new CreateUnit(repo);
      const unit = await useCase.execute({
        name: "kg",
        category: "Weight",
        isBaseUnit: true,
        precision: 3,
      });

      expect(unit.id).toBeDefined();
      const found = await repo.findById(unit.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe("kg");
    });

    it("should throw error when unit name already exists", async () => {
      const useCase = new CreateUnit(repo);
      await useCase.execute({
        name: "meter",
        category: "Length",
        isBaseUnit: true,
        precision: 2,
      });

      await expect(
        useCase.execute({
          name: "meter",
          category: "Length",
          isBaseUnit: true,
          precision: 2,
        }),
      ).rejects.toThrow(UnitNameAlreadyExistsError);
    });
  });

  describe("UpdateUnit Use Case", () => {
    it("should update unit details", async () => {
      const createUseCase = new CreateUnit(repo);
      const updateUseCase = new UpdateUnit(repo);

      const created = await createUseCase.execute({
        name: "liter",
        category: "Volume",
        isBaseUnit: true,
        precision: 2,
      });

      const updated = await updateUseCase.execute(created.id, {
        name: "litre",
        precision: 3,
      });

      expect(updated.name).toBe("litre");
      expect(updated.precision).toBe(3);
    });

    it("should throw error if updating non-existent unit", async () => {
      const updateUseCase = new UpdateUnit(repo);
      await expect(
        updateUseCase.execute("non-existent-id", { name: "g" }),
      ).rejects.toThrow(UnitNotFoundError);
    });
  });

  describe("DeleteUnit Use Case", () => {
    it("should delete unit", async () => {
      const createUseCase = new CreateUnit(repo);
      const deleteUseCase = new DeleteUnit(repo);

      const created = await createUseCase.execute({
        name: "temp-unit",
        category: "Test",
        isBaseUnit: true,
        precision: 0,
      });

      await deleteUseCase.execute(created.id);
      const found = await repo.findById(created.id);
      expect(found).toBeNull();
    });
  });
});
