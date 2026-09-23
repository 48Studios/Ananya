"use client";

import * as React from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check,
  Loader2,
  Sliders,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { mlApi, type ComponentSuggestionResponseDto } from "@/lib/api/ml-api";
import type { AttributeSuggestionDto } from "@/lib/api/ml-api";
import {
  attributeValuePatch,
  canAcceptSuggestion,
} from "@/lib/attribute-suggestions";
import { AttributeSuggestionsPanel } from "./attribute-suggestions-panel";
import { AiSuggestionReviewCard } from "./ai-suggestion-review-card";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import { EntitySelector } from "@/components/ui/entity-selector";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  componentsApi,
  type ComponentDto,
  type CreateComponentPayload,
  type UpdateComponentPayload,
} from "@/lib/api/components-api";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type AttributeOptionDto,
  type ResolvedCategoryAttributeDto,
} from "@/lib/api/attributes-api";
import { categoriesApi } from "@/lib/api/categories-api";
import { manufacturersApi } from "@/lib/api/manufacturers-api";
import { findAssignableEntity } from "@/lib/component-entity-assignment";
import type { CategoryDto } from "@/lib/api/categories-api";
import type { ManufacturerDto } from "@/lib/api/manufacturers-api";

const componentSchema = z.object({
  sku: z
    .string()
    .transform((val) => val?.trim().toUpperCase() ?? ""),
  manufacturerPartNumber: z.string().optional().nullable(),
  name: z
    .string()
    .min(1, "Component name is required")
    .transform((val) => val.trim()),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  manufacturerId: z.string().optional().nullable(),
  unit: z
    .string()
    .min(1, "Unit of measure is required")
    .transform((val) => val.trim().toLowerCase()),
  defaultLocationId: z.string().optional().nullable(),
});

export type ComponentFormValues = z.infer<typeof componentSchema>;

interface ComponentFormProps {
  initialData?: ComponentDto | null;
  onSuccess: (savedComponent: ComponentDto) => void;
  onCancel: () => void;
}

interface PendingManufacturer {
  name: string;
  code?: string;
}

interface PendingCategory {
  name: string;
  code?: string;
  parentId?: string | null;
  description?: string | null;
}

interface VisibleAttribute {
  attributeDefinition: AttributeDefinitionDto;
  options: AttributeOptionDto[];
  isRequired: boolean;
}

interface UnresolvedSuggestedAttribute {
  code: string;
  formatted: string;
  unit?: string | null;
}

/**
 * How long a category change waits before re-running the intelligence.
 *
 * Long enough that stepping through a category list produces one analysis
 * rather than one per intermediate choice, short enough that the reviewer does
 * not wonder whether the click registered.
 */
const CATEGORY_INTELLIGENCE_DEBOUNCE_MS = 400;

const COMPATIBLE_UNITS: Record<string, string[]> = {  Resistance: ["ohm", "kohm", "Mohm"],
  Capacitance: ["uF", "nF", "pF", "F"],
  Voltage: ["V", "mV", "kV"],
  Power: ["W", "mW", "kW"],
  Current: ["mA", "A", "uA"],
  Inductance: ["uH", "mH", "H"],
  Length: ["mm", "cm", "m"],
  Percentage: ["%"],
  Temperature: ["°C"],
};

export function ComponentForm({
  initialData,
  onSuccess,
  onCancel,
}: ComponentFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const [categoryAttributes, setCategoryAttributes] = React.useState<
    ResolvedCategoryAttributeDto[]
  >([]);
  const [loadingAttrs, setLoadingAttrs] = React.useState(false);
  const [attrValues, setAttrValues] = React.useState<
    Record<
      string,
      {
        value?: unknown;
        attributeDefinitionId?: string | null;
        unit?: string | null;
        optionCode?: string;
        selectedOptionCodes?: string[];
      }
    >
  >({});

  const [suggestion, setSuggestion] = React.useState<ComponentSuggestionResponseDto | null>(null);
  const [loadingAi, setLoadingAi] = React.useState(false);
  const [showDatasheetBox, setShowDatasheetBox] = React.useState(false);
  const [datasheetInput, setDatasheetInput] = React.useState("");
  const [pendingManufacturer, setPendingManufacturer] =
    React.useState<PendingManufacturer | null>(null);
  const [pendingCategory, setPendingCategory] =
    React.useState<PendingCategory | null>(null);
  /**
   * Records the reviewer already holds, for resolving a typed name.
   *
   * Loaded once rather than per keystroke, and only read when a reviewer types
   * over a suggestion: the answer decides whether the field shows an existing
   * record or a to-be-created one, which is a decision the reviewer has to be
   * able to trust.
   */
  const [assignableCategories, setAssignableCategories] = React.useState<
    CategoryDto[]
  >([]);
  const [assignableManufacturers, setAssignableManufacturers] = React.useState<
    ManufacturerDto[]
  >([]);
  /**
   * Fields the reviewer chose by hand.
   *
   * An explicit choice — applying one row, or typing a correct one — outranks a
   * later bulk apply: "Apply All Suggestions" completing the rest of the card
   * must not silently revert a correction the reviewer already made.
   */
  const [categoryChosenByReviewer, setCategoryChosenByReviewer] =
    React.useState(false);
  const [manufacturerChosenByReviewer, setManufacturerChosenByReviewer] =
    React.useState(false);
  const [loadingSkuPreview, setLoadingSkuPreview] = React.useState(false);
  const [attributeDefinitions, setAttributeDefinitions] = React.useState<
    AttributeDefinitionDto[]
  >([]);
  const [unresolvedSuggestedAttributes, setUnresolvedSuggestedAttributes] =
    React.useState<Record<string, UnresolvedSuggestedAttribute>>({});
  /**
   * The attribute suggestions the last intelligence call returned.
   *
   * Held separately from the whole suggestion so re-conditioning on a category
   * change can refresh them without discarding the reviewer's identity and
   * classification work, which a category change has no bearing on.
   */
  const [attributeSuggestions, setAttributeSuggestions] = React.useState<
    AttributeSuggestionDto[]
  >([]);
  const [loadingAttributeSuggestions, setLoadingAttributeSuggestions] =
    React.useState(false);
  const [
    attributeIntelligenceUnavailable,
    setAttributeIntelligenceUnavailable,
  ] = React.useState(false);
  const [appliedSuggestionIds, setAppliedSuggestionIds] = React.useState<
    ReadonlySet<string>
  >(new Set());
  /**
   * Which intelligence request is the current one.
   *
   * A category change re-runs the analysis, and two requests in flight can
   * settle out of order: the older one must not overwrite the newer one's
   * suggestions. Each request takes the next generation number and only the
   * newest may write state.
   */
  const intelligenceRequestRef = React.useRef(0);
  /** The category the current suggestions were conditioned on. */
  const suggestionsCategoryRef = React.useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ComponentFormValues>({
    resolver: zodResolver(componentSchema),
    defaultValues: {
      sku: initialData?.sku ?? "",
      manufacturerPartNumber: initialData?.manufacturerPartNumber ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      categoryId: initialData?.categoryId ?? null,
      manufacturerId: initialData?.manufacturerId ?? null,
      unit: initialData?.unit ?? "pcs",
      defaultLocationId: initialData?.defaultLocationId ?? "",
    },
  });

  const selectedCategoryId = useWatch({ control, name: "categoryId" });
  /**
   * The definition ids the form can render.
   *
   * Passed to the panel so an accepted suggestion always resolves to an
   * attribute definition that still exists: one deleted between the analysis
   * and the click is reported instead of being written into a row the editor
   * cannot draw.
   */
  const definitionIds = React.useMemo(
    () => new Set(attributeDefinitions.map((definition) => definition.id)),
    [attributeDefinitions],
  );
  const visibleAttributes = React.useMemo<VisibleAttribute[]>(() => {
    const byIdentity = new Map<string, VisibleAttribute>();

    for (const categoryAttribute of categoryAttributes) {
      const definition = categoryAttribute.attributeDefinition;
      byIdentity.set(definition.id || definition.code, {
        attributeDefinition: definition,
        options: categoryAttribute.options ?? definition.options ?? [],
        isRequired: categoryAttribute.isRequired,
      });
    }

    for (const [code, value] of Object.entries(attrValues)) {
      if (!value.attributeDefinitionId) continue;
      const definition =
        attributeDefinitions.find(
          (candidate) => candidate.id === value.attributeDefinitionId,
        ) ??
        attributeDefinitions.find(
          (candidate) => candidate.code.toLowerCase() === code.toLowerCase(),
        ) ??
        categoryAttributes.find(
          (candidate) =>
            candidate.attributeDefinition.id === value.attributeDefinitionId ||
            candidate.attributeDefinition.code.toLowerCase() === code.toLowerCase(),
        )?.attributeDefinition;

      const fallbackDefinition = !definition
        ? {
            id: value.attributeDefinitionId,
            code,
            name: code,
            dataType: value.unit ? ("QUANTITY" as const) : ("TEXT" as const),
            defaultUnit: value.unit ?? null,
            unitCategory: null,
            description: null,
            isFilterable: false,
            sortOrder: 0,
            isActive: true,
            options: [],
          }
        : undefined;
      const resolvedDefinition = definition ?? fallbackDefinition;
      if (!resolvedDefinition) continue;
      const identity = resolvedDefinition.id || resolvedDefinition.code;
      if (!byIdentity.has(identity)) {
        byIdentity.set(identity, {
          attributeDefinition: resolvedDefinition,
          options: resolvedDefinition.options ?? [],
          isRequired: false,
        });
      }
    }

    return Array.from(byIdentity.values());
  }, [attributeDefinitions, attrValues, categoryAttributes]);

  // Initialize form and attribute state from initialData
  React.useEffect(() => {
    reset({
      sku: initialData?.sku ?? "",
      manufacturerPartNumber: initialData?.manufacturerPartNumber ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      categoryId: initialData?.categoryId ?? null,
      manufacturerId: initialData?.manufacturerId ?? null,
      unit: initialData?.unit ?? "pcs",
      defaultLocationId: initialData?.defaultLocationId ?? "",
    });
    setPendingManufacturer(null);
    setPendingCategory(null);
    setCategoryChosenByReviewer(false);
    setManufacturerChosenByReviewer(false);

    if (initialData?.attributes) {
      const initialAttrs: Record<
        string,
        {
          value?: unknown;
          attributeDefinitionId?: string | null;
          unit?: string | null;
          optionCode?: string;
          selectedOptionCodes?: string[];
        }
      > = {};
      for (const [code, item] of Object.entries(initialData.attributes)) {
        let selectedOptionCodes: string[] | undefined;
        if (Array.isArray(item.value)) {
          selectedOptionCodes = item.value.map(String);
        }
        initialAttrs[code] = {
          value: item.value,
          unit: item.unit,
          optionCode:
            item.optionCode ??
            (typeof item.value === "string" ? item.value : ""),
          attributeDefinitionId: item.definitionId,
          selectedOptionCodes,
        };
      }
      setAttrValues(initialAttrs);
    } else {
      setAttrValues({});
    }
    setUnresolvedSuggestedAttributes({});
  }, [initialData, reset]);

  React.useEffect(() => {
    let current = true;
    attributesApi
      .getAll()
      .then((definitions) => {
        if (current) setAttributeDefinitions(definitions);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  /**
   * The records a typed suggestion value can resolve to.
   *
   * Failure is non-blocking: without them a typed name simply cannot be matched,
   * so it is treated as new and created on save — which is what the API does
   * with a name it cannot find anyway.
   */
  React.useEffect(() => {
    let current = true;
    Promise.all([
      categoriesApi.getAll().catch(() => []),
      manufacturersApi.getAll().catch(() => []),
    ]).then(([categories, manufacturers]) => {
      if (!current) return;
      setAssignableCategories(categories);
      setAssignableManufacturers(manufacturers);
    });
    return () => {
      current = false;
    };
  }, []);

  React.useEffect(() => {
    if (isEditing || watch("sku")) return;
    let current = true;
    setLoadingSkuPreview(true);
    componentsApi
      .previewSku()
      .then((sku) => {
        if (current && !watch("sku")) {
          setValue("sku", sku, { shouldDirty: false });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (current) setLoadingSkuPreview(false);
      });
    return () => {
      current = false;
    };
  }, [isEditing, setValue, watch]);

  // Load category attributes when category changes
  React.useEffect(() => {
    let isCurrent = true;
    if (!selectedCategoryId) {
      setCategoryAttributes([]);
      return;
    }

    setLoadingAttrs(true);
    attributesApi
      .getByCategory(selectedCategoryId)
      .then((data) => {
        if (isCurrent) {
          setCategoryAttributes(data);
          // Set default units for QUANTITY attributes if not already populated
          setAttrValues((prev) => {
            const next = { ...prev };
            for (const item of data) {
              const code = item.attributeDefinition.code;
              if (
                item.attributeDefinition.dataType === "QUANTITY" &&
                !next[code]?.unit
              ) {
                const defUnit =
                  item.attributeDefinition.defaultUnit ||
                  (item.attributeDefinition.unitCategory &&
                    COMPATIBLE_UNITS[item.attributeDefinition.unitCategory]?.[0]) ||
                  "";
                next[code] = {
                  ...next[code],
                  unit: defUnit,
                };
              }
            }
            return next;
          });
        }
      })
      .catch(() => {
        if (isCurrent) setCategoryAttributes([]);
      })
      .finally(() => {
        if (isCurrent) setLoadingAttrs(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedCategoryId]);

  /**
   * Re-conditions the attribute intelligence on a changed category.
   *
   * The category decides which attributes matter, so selecting a different one
   * has to re-run the analysis — deliberately opposite to deleting anything: the
   * component's own attribute values are never touched here, and an attribute
   * that is no longer relevant simply stops being suggested.
   *
   * Debounced, because a reviewer clicking through the category list should not
   * fire one analysis per intermediate choice, and skipped when the suggestions
   * are already conditioned on this category (a re-render is not a change).
   */
  React.useEffect(() => {
    if (!suggestion) return;
    if (selectedCategoryId === suggestionsCategoryRef.current) return;

    const timer = setTimeout(() => {
      void handleFetchAiSuggestions();
    }, CATEGORY_INTELLIGENCE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `handleFetchAiSuggestions` is intentionally not a dependency: it closes
    // over the current form values, and depending on it would re-run this effect
    // on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId]);

  const handleAttrChange = (code: string, field: string, val: unknown) => {
    setAttrValues((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: val,
      },
    }));
  };

  const toggleMultiSelectOption = (code: string, optCode: string) => {
    setAttrValues((prev) => {
      const currentList = prev[code]?.selectedOptionCodes ?? [];
      const exists = currentList.includes(optCode);
      const nextList = exists
        ? currentList.filter((c) => c !== optCode)
        : [...currentList, optCode];
      return {
        ...prev,
        [code]: {
          ...prev[code],
          value: nextList,
          selectedOptionCodes: nextList,
        },
      };
    });
  };

  const applyEntitySuggestions = (
    nextSuggestion: ComponentSuggestionResponseDto,
    options: { overwrite?: boolean; includeReviewerChoices?: boolean } = {},
  ) => {
    const { overwrite = false, includeReviewerChoices = false } = options;
    const currentManufacturerId = watch("manufacturerId");
    const currentCategoryId = watch("categoryId");

    if (
      nextSuggestion.manufacturer &&
      (includeReviewerChoices || !manufacturerChosenByReviewer) &&
      (overwrite || (!currentManufacturerId && !pendingManufacturer))
    ) {
      if (
        nextSuggestion.manufacturer.resolution === "EXISTING" &&
        nextSuggestion.manufacturer.manufacturerId
      ) {
        setValue("manufacturerId", nextSuggestion.manufacturer.manufacturerId, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setPendingManufacturer(null);
      } else if (nextSuggestion.manufacturer.resolution === "NEW_CANDIDATE") {
        // The model proposed a name; the ERP may already hold it. Resolving it
        // here is what keeps the field from claiming "NEW" beside a record that
        // exists and will be bound on save.
        const existing = findAssignableEntity({
          typedName: nextSuggestion.manufacturer.manufacturerName ?? "",
          entities: assignableManufacturers,
        });
        setValue("manufacturerId", existing?.id ?? null, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setPendingManufacturer(
          existing
            ? null
            : {
                name: nextSuggestion.manufacturer.manufacturerName,
                code: nextSuggestion.manufacturer.manufacturerCode,
              },
        );
      }
    }

    if (
      nextSuggestion.category &&
      (includeReviewerChoices || !categoryChosenByReviewer) &&
      (overwrite || (!currentCategoryId && !pendingCategory))
    ) {
      if (
        nextSuggestion.category.resolution === "EXISTING" &&
        nextSuggestion.category.categoryId
      ) {
        setValue("categoryId", nextSuggestion.category.categoryId, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setPendingCategory(null);
      } else if (nextSuggestion.category.resolution === "NEW_CANDIDATE") {
        const proposedName =
          nextSuggestion.category.subcategoryName ||
          nextSuggestion.category.categoryName;
        const existing = findAssignableEntity({
          typedName: proposedName,
          entities: assignableCategories,
          preferredParentId: nextSuggestion.category.parentCategoryId ?? null,
        });
        setValue("categoryId", existing?.id ?? null, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setPendingCategory(
          existing
            ? null
            : {
                name: proposedName,
                code:
                  nextSuggestion.category.subcategoryCode ||
                  nextSuggestion.category.categoryCode,
                parentId: nextSuggestion.category.parentCategoryId ?? null,
                description:
                  nextSuggestion.category.proposedDescription ?? null,
              },
        );
      }
    }
  };

  const handleFetchAiSuggestions = async (overrideQuery?: string) => {
    const q = overrideQuery || datasheetInput || watch("manufacturerPartNumber") || watch("name");
    if (!q || q.trim().length === 0) return;

    const generation = intelligenceRequestRef.current + 1;
    intelligenceRequestRef.current = generation;
    setLoadingAi(true);
    setLoadingAttributeSuggestions(true);
    setAttributeIntelligenceUnavailable(false);
    setServerError(null);
    try {
      const res = await mlApi.suggest({
        query: q.trim(),
        partNumber: watch("manufacturerPartNumber") || undefined,
        description: watch("name") || datasheetInput || undefined,
        datasheetText: datasheetInput || undefined,
        // Editing an existing record: the component must not be compared with
        // itself, or it is reported as its own duplicate.
        componentId: initialData?.id,
        // The category the reviewer is looking at conditions the attribute
        // relevance, so a hand-picked category drives the suggestions even
        // before the record is saved with it.
        categoryId: selectedCategoryId ?? undefined,
      });
      // A newer request has already been made: this answer describes an earlier
      // category and must not overwrite the state the reviewer is looking at.
      if (intelligenceRequestRef.current !== generation) return;

      suggestionsCategoryRef.current = selectedCategoryId ?? null;
      setSuggestion(res);
      setAttributeSuggestions(res.attributeSuggestions ?? []);
      // The applied markers belong to the analysis that produced them.
      setAppliedSuggestionIds(new Set());
      setUnresolvedSuggestedAttributes(
        Object.fromEntries(
          Object.entries(res.attributes)
            .filter(
              ([, attribute]) =>
                attribute.resolution === "UNRESOLVED" ||
                !attribute.attributeDefinitionId,
            )
            .map(([code, attribute]) => [
              code,
              {
                code,
                formatted: attribute.formatted,
                unit: attribute.unit,
              },
            ]),
        ),
      );
      applyEntitySuggestions(res);
    } catch (err: unknown) {
      console.warn("AI suggestion fetch failed:", err);
      if (intelligenceRequestRef.current === generation) {
        // The form stays fully usable: only the attribute section reports that
        // the intelligence is unavailable.
        setAttributeIntelligenceUnavailable(true);
        setAttributeSuggestions([]);
      }
    } finally {
      if (intelligenceRequestRef.current === generation) {
        setLoadingAi(false);
        setLoadingAttributeSuggestions(false);
      }
    }
  };

  /**
   * Writes an accepted attribute suggestion into the dynamic attribute state.
   *
   * This is the same state the manual editor writes, so an accepted value is
   * indistinguishable from a typed one from here on and the normal Save flow
   * persists both. Nothing is written for a suggestion with no canonical value,
   * and an existing recorded value is never replaced unless the reviewer chose
   * to apply it.
   */
  const applyAttributeSuggestion = (suggestion: AttributeSuggestionDto) => {
    const patch = attributeValuePatch(suggestion);
    if (!patch) return;
    setAttrValues((prev) => ({
      ...prev,
      [suggestion.code]: { ...prev[suggestion.code], ...patch },
    }));
    setAppliedSuggestionIds((prev) => {
      const next = new Set(prev);
      next.add(suggestion.attributeDefinitionId);
      return next;
    });
    void recordAttributeSuggestionFeedback(suggestion, "ACCEPTED", patch.value);
  };

  const applyAttributeSuggestions = (suggestions: AttributeSuggestionDto[]) => {
    for (const suggestion of suggestions) {
      applyAttributeSuggestion(suggestion);
    }
  };

  /**
   * Opens a suggestion in the existing attribute editor.
   *
   * "Edit" means the reviewer wants the attribute in front of them, so the row
   * is written into the attribute state (making it render in the editor below)
   * and the field is focused there. No second editor is introduced.
   */
  const editAttributeSuggestion = (suggestion: AttributeSuggestionDto) => {
    const patch = attributeValuePatch(suggestion);
    if (patch) {
      setAttrValues((prev) => ({
        ...prev,
        [suggestion.code]: { ...prev[suggestion.code], ...patch },
      }));
    }
    // The editor row for an attribute the component does not record yet is
    // rendered as a *result* of the state write above, so the field is looked up
    // on the next frame: focusing synchronously would find nothing for exactly
    // the suggestions the reviewer most needs to see (attributes discovered from
    // evidence rather than bound to the category).
    const focusEditorField = () => {
      const field = document.getElementById(`attr-${suggestion.code}`);
      if (field instanceof HTMLElement) {
        field.scrollIntoView({ block: "center", behavior: "smooth" });
        field.focus({ preventScroll: true });
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(focusEditorField);
    } else {
      focusEditorField();
    }
  };

  /**
   * Rejects a suggestion for this session only.
   *
   * Nothing outside the form is touched: no attribute definition, no category
   * binding and no component attribute is changed by a rejection.
   */
  const rejectAttributeSuggestion = (suggestion: AttributeSuggestionDto) => {
    void recordAttributeSuggestionFeedback(suggestion, "REJECTED", null);
  };

  /**
   * Records the reviewer's decision as attribute telemetry.
   *
   * Reuses the existing feedback endpoint and the `ATTRIBUTE` vocabulary; a
   * failure is swallowed because telemetry must never block the form.
   *
   * `Edit` deliberately records nothing: it hands the value to the attribute
   * editor, where the reviewer's own input becomes the component's data through
   * the normal Save. Recording an edit here would be claiming a correction that
   * may not have happened.
   */
  const recordAttributeSuggestionFeedback = async (
    suggestion: AttributeSuggestionDto,
    userAction: "ACCEPTED" | "REJECTED",
    finalValue: unknown,
  ) => {
    const confidence = suggestion.confidence;
    if (confidence === null) return;
    try {
      await mlApi.recordFeedback({
        componentId: initialData?.id,
        items: [
          {
            suggestionType: "ATTRIBUTE",
            field: `attribute_suggestions.${suggestion.code}`,
            predictedValue: suggestion.suggestedValue?.value ?? null,
            confidence,
            confidenceLevel: suggestion.confidenceLevel ?? undefined,
            evidence: [...suggestion.relevance, ...suggestion.valueEvidence],
            userAction,
            finalValue,
          },
        ],
      });
    } catch {
      // Telemetry is best-effort by design.
    }
  };

  const handleApplyAllSuggestions = () => {
    if (!suggestion) return;

    // Completes the card without reverting a field the reviewer already chose.
    applyEntitySuggestions(suggestion, { overwrite: true });

    if (suggestion.manufacturerPartNumber) {
      setValue("manufacturerPartNumber", suggestion.manufacturerPartNumber, {
        shouldDirty: true,
      });
    }
    if (suggestion.suggestedName) {
      setValue("name", suggestion.suggestedName, { shouldValidate: true });
    }
    if (suggestion.suggestedDescription) {
      setValue("description", suggestion.suggestedDescription, {
        shouldDirty: true,
      });
    }
    if (suggestion.suggestedUnit) {
      setValue("unit", suggestion.suggestedUnit, { shouldValidate: true });
    }

    // The specifications go through the same applier the panel's rows and the
    // Apply Specifications action use, so "apply everything" cannot write a
    // different set of values than applying them one by one would.
    applyEligibleSpecifications();
  };

  /**
   * Applies the suggested category, or the value the reviewer chose over it.
   *
   * A typed name is matched against the records the ERP already holds, so
   * typing an existing category selects that category instead of showing a
   * duplicate as new. Only a name nothing matches is held as a pending entity
   * and created when the component is saved. A pending entity carries no code
   * on purpose: `PendingComponentEntityService` derives one from the name, while
   * reusing the suggestion's code would collide with the category it came from.
   *
   * Called with no argument by the card's own Apply button, which means "use the
   * model's suggestion" and releases any earlier choice for this field.
   */
  const handleApplyCategory = (customName?: string) => {
    if (!suggestion) return;
    // A click handler can be wired straight to this function, so only a string
    // is ever treated as a typed value.
    const typed = typeof customName === "string" ? customName.trim() : "";

    if (typed) {
      const suggestedParentId =
        suggestion.category?.parentCategoryId ?? null;
      const existing = findAssignableEntity({
        typedName: typed,
        entities: assignableCategories,
        preferredParentId: suggestedParentId,
      });
      setCategoryChosenByReviewer(true);
      setValue("categoryId", existing?.id ?? null, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setPendingCategory(
        existing ? null : { name: typed, parentId: suggestedParentId },
      );
      return;
    }

    setCategoryChosenByReviewer(false);
    applyEntitySuggestions(
      { ...suggestion, manufacturer: null },
      { overwrite: true, includeReviewerChoices: true },
    );
  };

  /**
   * Applies the suggested manufacturer, or the value the reviewer chose over it.
   *
   * Mirrors {@link handleApplyCategory}: a typed name that the ERP already holds
   * selects that record, and only an unknown name becomes a pending entity.
   */
  const handleApplyManufacturer = (customName?: string) => {
    if (!suggestion) return;
    const typed = typeof customName === "string" ? customName.trim() : "";

    if (typed) {
      const existing = findAssignableEntity({
        typedName: typed,
        entities: assignableManufacturers,
      });
      setManufacturerChosenByReviewer(true);
      setValue("manufacturerId", existing?.id ?? null, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setPendingManufacturer(existing ? null : { name: typed });
      return;
    }

    setManufacturerChosenByReviewer(false);
    applyEntitySuggestions(
      { ...suggestion, category: null },
      { overwrite: true, includeReviewerChoices: true },
    );
  };

  /**
   * Applies every attribute suggestion the reviewer can apply in one action.
   *
   * This is the single definition of "apply the specifications": the same set of
   * rows, written through the same state, as accepting them one at a time. It
   * used to read the raw extraction record and write its own shape into the
   * attribute state, which is how one value ended up with two writers.
   *
   * The eligible set excludes a conflict (the reviewer must decide) and a value
   * the component already records, and it is computed from the same rule the
   * rows use — never a second, looser filter.
   */
  const applyEligibleSpecifications = () => {
    applyAttributeSuggestions(
      attributeSuggestions.filter(
        (suggestion) =>
          canAcceptSuggestion(suggestion) &&
          !appliedSuggestionIds.has(suggestion.attributeDefinitionId),
      ),
    );
  };

  /**
   * The suggestions the specifications action can still apply.
   *
   * Counted once, from the same eligibility rule the applier uses, so the button
   * cannot promise a different number from what it writes. Suggestions already
   * applied are excluded, which is what makes the count fall to zero and the
   * action collapse into its applied state.
   */
  const appliableSuggestions = React.useMemo(
    () =>
      attributeSuggestions.filter(
        (suggestion) =>
          canAcceptSuggestion(suggestion) &&
          !appliedSuggestionIds.has(suggestion.attributeDefinitionId),
      ),
    [attributeSuggestions, appliedSuggestionIds],
  );
  const appliableSuggestionCount = appliableSuggestions.length;
  /**
   * True once nothing appliable is left *and* something was appliable before.
   *
   * An empty eligible set means "nothing to apply" — which the action states as
   * a disabled button — while a set that has been emptied by applying is the
   * applied state the reviewer needs to see. Distinguishing the two is what
   * keeps "Applied" from appearing on a component that had nothing to apply.
   */
  const allEligibleSuggestionsApplied =
    appliableSuggestionCount === 0 && appliedSuggestionIds.size > 0;

  const onSubmit = async (values: ComponentFormValues) => {
    setServerError(null);

    // Validate required dynamic attributes
    for (const item of categoryAttributes) {
      if (item.isRequired) {
        const current = attrValues[item.attributeDefinition.code];
        const val = current?.value;
        const opt = current?.optionCode;
        const multi = current?.selectedOptionCodes;

        if (item.attributeDefinition.dataType === "MULTI_SELECT") {
          if (!multi || multi.length === 0) {
            setServerError(
              `Required specification missing: "${item.attributeDefinition.name}" requires at least one selection.`,
            );
            return;
          }
        } else if (item.attributeDefinition.dataType === "SELECT") {
          if (!opt || opt === "") {
            setServerError(
              `Required specification missing: "${item.attributeDefinition.name}" is required for this category.`,
            );
            return;
          }
        } else if (val === undefined || val === null || val === "") {
          setServerError(
            `Required specification missing: "${item.attributeDefinition.name}" is required for this category.`,
          );
          return;
        }
      }
    }

    try {
      if (isEditing && initialData) {
        const payload: UpdateComponentPayload = {
          manufacturerPartNumber: values.manufacturerPartNumber || null,
          name: values.name,
          description: values.description || null,
          categoryId: values.categoryId || null,
          manufacturerId: values.manufacturerId || null,
          unit: values.unit,
          defaultLocationId: values.defaultLocationId || null,
          pendingManufacturer,
          pendingCategory,
          attributes: Object.fromEntries(
            Object.entries(attrValues).filter(
              ([, attribute]) => Boolean(attribute.attributeDefinitionId),
            ),
          ),
        };
        const updated = await componentsApi.update(initialData.id, payload);
        setPendingManufacturer(null);
        setPendingCategory(null);
        onSuccess(updated);
      } else {
        const payload: CreateComponentPayload = {
          ...(values.sku ? { sku: values.sku } : {}),
          name: values.name,
          manufacturerPartNumber: values.manufacturerPartNumber || null,
          description: values.description || null,
          categoryId: values.categoryId || null,
          manufacturerId: values.manufacturerId || null,
          unit: values.unit,
          defaultLocationId: values.defaultLocationId || null,
          pendingManufacturer,
          pendingCategory,
          attributes: Object.fromEntries(
            Object.entries(attrValues).filter(
              ([, attribute]) => Boolean(attribute.attributeDefinitionId),
            ),
          ),
        };
        const created = await componentsApi.create(payload);
        setPendingManufacturer(null);
        setPendingCategory(null);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing
            ? "Failed to update component"
            : "Failed to create component",
        );
      }
    }
  };
  console.log("attrValues", suggestion);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogShellBody className="space-y-4">
        {serverError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {serverError}
          </div>
        )}

        {/* ── AI Quick Actions Bar ─────────────────────────────────────────── */}
        {!suggestion && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              <span>Smart Component Intelligence</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDatasheetBox(!showDatasheetBox)}
                className="h-7 text-xs font-medium px-2.5 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <FileText className="size-3" />
                {showDatasheetBox ? "Hide Datasheet Box" : "Paste Datasheet"}
                {showDatasheetBox ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingAi}
                onClick={() => handleFetchAiSuggestions()}
                className="h-7 text-xs font-medium px-2.5 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 bg-primary/5"
              >
                {loadingAi ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3 text-primary" />
                )}
                {loadingAi ? "Analyzing…" : "Auto-detect with AI"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Expandable Datasheet Text Box ─────────────────────────────────── */}
        {!suggestion && showDatasheetBox && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 shadow-2xs">
            <FieldLabel htmlFor="datasheet-input" className="text-xs">
              Raw Datasheet or Spec Text
            </FieldLabel>
            <Textarea
              id="datasheet-input"
              rows={3}
              placeholder="Paste component specs, e.g.: '0805 SMD Resistor 10k Ohm 1% 1/4W 50V Thin Film Yageo' or raw datasheet snippets..."
              value={datasheetInput}
              onChange={(e) => setDatasheetInput(e.target.value)}
              className="text-xs font-mono"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={loadingAi || !datasheetInput.trim()}
                onClick={() => handleFetchAiSuggestions(datasheetInput)}
                className="h-7 text-xs font-medium px-2.5 gap-1.5 bg-primary text-primary-foreground"
              >
                {loadingAi ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                Extract & Suggest
              </Button>
            </div>
          </div>
        )}

        {/*
          ONE intelligence card.

          The attribute suggestions used to be a second top-level card beside
          this one, and the extracted values were listed a third time as chips
          inside it — so a specification appeared twice in the same intelligence
          experience. They are now one card: the analysis, its identity and
          classification results, and the attribute suggestions that follow from
          them, with a single apply path into the attribute editor below.

          The unresolved extractions are NOT lost: an extracted value with no
          attribute definition is kept as a provisional entry in the Component
          Attributes section, which is where the reviewer can act on it.
        */}
        {suggestion && (
          <AiSuggestionReviewCard
            suggestion={suggestion}
            creationContext={{
              sku: watch("sku"),
              manufacturerPartNumber: watch("manufacturerPartNumber"),
              name: watch("name"),
              description: watch("description") || datasheetInput,
              query: datasheetInput || watch("manufacturerPartNumber") || watch("name"),
            }}
            onApplyAll={handleApplyAllSuggestions}
            onApplyIdentity={() => {
              if (suggestion.manufacturerPartNumber) {
                setValue("manufacturerPartNumber", suggestion.manufacturerPartNumber, {
                  shouldDirty: true,
                });
              }
              handleApplyManufacturer();
            }}
            onApplyClassification={handleApplyCategory}
            onApplyNameDescription={() => {
              if (suggestion.suggestedName) {
                setValue("name", suggestion.suggestedName, { shouldDirty: true });
              }
              if (suggestion.suggestedDescription) {
                setValue("description", suggestion.suggestedDescription, {
                  shouldDirty: true,
                });
              }
            }}
            onApplyCategory={handleApplyCategory}
            onApplyManufacturer={handleApplyManufacturer}
            onApplySpecifications={applyEligibleSpecifications}
            specificationsAppliableCount={appliableSuggestionCount}
            specificationsApplied={allEligibleSuggestionsApplied}
            attributeSuggestionsSlot={
              <AttributeSuggestionsPanel
                embedded
                suggestions={attributeSuggestions}
                loading={loadingAttributeSuggestions}
                unavailable={attributeIntelligenceUnavailable}
                hasCategory={Boolean(selectedCategoryId)}
                definitionIds={definitionIds}
                appliedDefinitionIds={appliedSuggestionIds}
                onApply={applyAttributeSuggestion}
                onEdit={editAttributeSuggestion}
                onReject={rejectAttributeSuggestion}
                onAcceptAll={applyAttributeSuggestions}
              />
            }
            onDismiss={() => {
              // Dismissing discards the suggestion entirely, so the reviewer's
              // per-field choices for it are cleared with it.
              setSuggestion(null);
              setCategoryChosenByReviewer(false);
              setManufacturerChosenByReviewer(false);
            }}
          />
        )}

        {/*
          The intelligence card is the only place attribute suggestions appear.
          It is skipped while the analysis is still running (there is nothing to
          show yet) but the panel reports its own loading and unavailable states
          once the card exists, so a failure is never silent.
        */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
          {/* SKU */}          <Field>
            <FieldLabel htmlFor="component-sku">
              Internal SKU
            </FieldLabel>
            <Input
              id="component-sku"
              type="text"
              placeholder={isEditing ? "CMP-000123" : "Generating preview..."}
              {...register("sku")}
              disabled={isEditing}
              aria-busy={loadingSkuPreview}
              className="font-mono"
            />
            {errors.sku?.message && (
              <FieldError>{errors.sku.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="component-mpn">Manufacturer Part Number</FieldLabel>
            <Input
              id="component-mpn"
              type="text"
              placeholder="e.g. RC0805FR-0727RL"
              {...register("manufacturerPartNumber")}
              className="font-mono"
            />
            <FieldDescription>Manufacturer identity, separate from the internal SKU.</FieldDescription>
          </Field>

          {/* Unit */}
          <Field>
            <FieldLabel htmlFor="component-unit">
              Default Unit <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="unit"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-unit"
                  entity="unit"
                  value={field.value}
                  onChange={(val) => field.onChange(val)}
                  creatable
                  clearable={false}
                />
              )}
            />
            {errors.unit?.message && (
              <FieldError>{errors.unit.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Name */}
        <Field>
          <FieldLabel htmlFor="component-name">
            Component Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="component-name"
            type="text"
            placeholder="e.g. 10k Ohm 0805 SMD Resistor"
            {...register("name")}
          />
          {errors.name?.message && (
            <FieldError>{errors.name.message}</FieldError>
          )}
        </Field>

        {/* Category and Manufacturer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category */}
          <Field>
            <FieldLabel htmlFor="component-category">Category</FieldLabel>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-category"
                  entity="category"
                  value={field.value ?? null}
                  onChange={(val) => {
                    setPendingCategory(null);
                    // Picking in the field itself is the reviewer's own choice,
                    // so it outranks anything a later bulk apply would write.
                    setCategoryChosenByReviewer(true);
                    field.onChange(val);
                  }}
                  placeholder="Select or search category..."
                  creatable
                  clearable
                  createParentId={suggestion?.category?.parentCategoryId ?? null}
                  aiSuggestion={suggestion?.category ? {
                    label: suggestion.category.subcategoryName || suggestion.category.categoryName,
                    resolution: suggestion.category.resolution,
                    value: suggestion.category.categoryId,
                  } : null}
                  pendingOption={pendingCategory ? {
                    label: pendingCategory.name,
                    sublabel: pendingCategory.parentId
                      ? "New • will be created on save"
                      : "New • will be created on save",
                  } : null}
                />
              )}
            />
            {errors.categoryId?.message && (
              <FieldError>{errors.categoryId.message}</FieldError>
            )}
          </Field>

          {/* Manufacturer */}
          <Field>
            <FieldLabel htmlFor="component-manufacturer">
              Manufacturer
            </FieldLabel>
            <Controller
              name="manufacturerId"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-manufacturer"
                  entity="manufacturer"
                  value={field.value ?? null}
                  onChange={(val) => {
                    setPendingManufacturer(null);
                    setManufacturerChosenByReviewer(true);
                    field.onChange(val);
                  }}
                  placeholder="Select or search manufacturer..."
                  creatable
                  clearable
                  aiSuggestion={suggestion?.manufacturer ? {
                    label: suggestion.manufacturer.manufacturerName || "Unknown manufacturer",
                    resolution: suggestion.manufacturer.resolution,
                    value: suggestion.manufacturer.manufacturerId,
                  } : null}
                  pendingOption={pendingManufacturer ? {
                    label: pendingManufacturer.name,
                    sublabel: "New • will be created on save",
                  } : null}
                />
              )}
            />
            {errors.manufacturerId?.message && (
              <FieldError>{errors.manufacturerId.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Dynamic Category Specifications Section */}
        {loadingAttrs && (
          <div className="py-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            Loading category specifications...
          </div>
        )}

        {(visibleAttributes.length > 0 ||
          Object.keys(unresolvedSuggestedAttributes).length > 0) && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <div className="flex items-center gap-1.5">
                <Sliders className="size-3.5 text-primary" />
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Component Attributes
                </h4>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Category attributes and attributes already assigned to this component.
              </p>
            </div>

            <div className="space-y-4">
              {visibleAttributes.map((attr) => {
                const def = attr.attributeDefinition;
                const definitionCode = def.code;
                const code =
                  Object.entries(attrValues).find(
                    ([key, value]) =>
                      value.attributeDefinitionId === def.id ||
                      key.toLowerCase() === definitionCode.toLowerCase(),
                  )?.[0] ?? definitionCode;
                const current = attrValues[code] ?? {};
                const inputId = `attr-${definitionCode}`;

                // Render control based on data type
                if (def.dataType === "SELECT") {
                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <SearchableSelect
                        id={inputId}
                        value={current.optionCode ?? ""}
                        onValueChange={(val) =>
                          handleAttrChange(code, "optionCode", val)
                        }
                        placeholder={`Select ${def.name.toLowerCase()}...`}
                        searchPlaceholder={`Search ${def.name.toLowerCase()}...`}
                        triggerClassName="h-9"
                        clearable={!attr.isRequired}
                        options={attr.options.map((opt) => ({
                          value: opt.code,
                          label: opt.label,
                          chip: opt.code !== opt.label ? opt.code : undefined,
                        }))}
                      />
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "MULTI_SELECT") {
                  const selected = current.selectedOptionCodes || [];
                  return (
                    <Field key={code} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor={inputId}>
                          {def.name}{" "}
                          {attr.isRequired && (
                            <span className="text-destructive">*</span>
                          )}
                        </FieldLabel>
                        {selected.length > 0 && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {selected.length} selected
                          </span>
                        )}
                      </div>
                      {attr.options && attr.options.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {attr.options.map((opt) => {
                            const isChecked = selected.includes(opt.code);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  toggleMultiSelectOption(code, opt.code)
                                }
                                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer ${isChecked
                                    ? "bg-primary text-primary-foreground border-primary font-medium shadow-xs"
                                    : "bg-muted/40 hover:bg-muted text-foreground border-border hover:border-border/80"
                                  }`}
                              >
                                {isChecked ? (
                                  <Check className="w-3 h-3 shrink-0" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                )}
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No options configured for this specification.
                        </p>
                      )}
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "BOOLEAN") {
                  return (
                    <Field
                      key={code}
                      className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs"
                    >
                      <div className="space-y-0.5">
                        <FieldLabel htmlFor={inputId}>
                          {def.name}{" "}
                          {attr.isRequired && (
                            <span className="text-destructive">*</span>
                          )}
                        </FieldLabel>
                        {def.description && (
                          <FieldDescription>{def.description}</FieldDescription>
                        )}
                      </div>
                      <Switch
                        id={inputId}
                        checked={Boolean(current.value)}
                        onCheckedChange={(checked) =>
                          handleAttrChange(code, "value", checked)
                        }
                      />
                    </Field>
                  );
                }

                if (def.dataType === "QUANTITY") {
                  const unitOptions =
                    (def.unitCategory && COMPATIBLE_UNITS[def.unitCategory]) ||
                    (def.defaultUnit ? [def.defaultUnit] : ["pcs"]);

                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <div className="flex w-full gap-2">
                        <Input
                          id={inputId}
                          type="number"
                          step="any"
                          placeholder="e.g. 10"
                          value={(current.value as string | number) ?? ""}
                          onChange={(e) =>
                            handleAttrChange(code, "value", e.target.value)
                          }
                          className="flex-1 min-w-0 font-mono"
                        />
                        <div className="w-24 shrink-0">
                          <Select
                            value={current.unit || def.defaultUnit || unitOptions[0] || ""}
                            onValueChange={(val) =>
                              handleAttrChange(code, "unit", val)
                            }
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {unitOptions.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "NUMBER" || def.dataType === "INTEGER") {
                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <Input
                        id={inputId}
                        type="number"
                        step={def.dataType === "INTEGER" ? "1" : "any"}
                        placeholder="e.g. 64"
                        value={(current.value as string | number) ?? ""}
                        onChange={(e) =>
                          handleAttrChange(code, "value", e.target.value)
                        }
                        className="font-mono"
                      />
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "DATE") {
                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <Input
                        id={inputId}
                        type="date"
                        value={(current.value as string | number) ?? ""}
                        onChange={(e) =>
                          handleAttrChange(code, "value", e.target.value)
                        }
                      />
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                // Default: TEXT
                return (
                  <Field key={code}>
                    <FieldLabel htmlFor={inputId}>
                      {def.name}{" "}
                      {attr.isRequired && (
                        <span className="text-destructive">*</span>
                      )}
                    </FieldLabel>
                    <Input
                      id={inputId}
                      type="text"
                      placeholder={`Enter ${def.name.toLowerCase()}...`}
                      value={(current.value as string | number) ?? ""}
                      onChange={(e) =>
                        handleAttrChange(code, "value", e.target.value)
                      }
                    />
                    {def.description && (
                      <FieldDescription>{def.description}</FieldDescription>
                    )}
                  </Field>
                );
              })}

              {Object.values(unresolvedSuggestedAttributes).map((attribute) => (
                <div
                  key={`unresolved-${attribute.code}`}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {attribute.code}
                    </span>
                    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      AI suggested
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-foreground">
                    {attribute.formatted}
                    {attribute.unit ? ` ${attribute.unit}` : ""}
                  </p>
                  <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                    Definition unresolved; this value is provisional.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Default Location */}
        <Field>
          <FieldLabel htmlFor="component-location">
            Default Storage Location
          </FieldLabel>
          <Controller
            name="defaultLocationId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="component-location"
                entity="location"
                value={field.value ?? ""}
                onChange={(val) => field.onChange(val)}
                placeholder="Select storage location..."
                creatable
                clearable
              />
            )}
          />
        </Field>

        {/* Description */}
        <Field>
          <FieldLabel htmlFor="component-desc">Description</FieldLabel>
          <Textarea
            id="component-desc"
            rows={3}
            placeholder="Detailed component specification..."
            {...register("description")}
            className="resize-none"
          />
        </Field>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Component"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
