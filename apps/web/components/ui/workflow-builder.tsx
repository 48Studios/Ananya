"use client";

import * as React from "react";
import { Zap, Plus, X, Loader2 } from "lucide-react";
import { notificationsApi } from "@/lib/api/notifications-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";

export interface WorkflowBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkflowCreated?: () => void;
}

export function WorkflowBuilder({
  isOpen,
  onClose,
  onWorkflowCreated,
}: WorkflowBuilderProps) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [triggerType, setTriggerType] = React.useState("INVENTORY_LOW");
  const [conditions, setConditions] = React.useState<
    Array<{ field: string; operator: string; value: string }>
  >([{ field: "stockLevel", operator: "GREATER_THAN", value: "0" }]);
  const [actions, setActions] = React.useState<
    Array<{ actionType: string; title: string; message: string }>
  >([
    {
      actionType: "CREATE_NOTIFICATION",
      title: "Low Stock Trigger",
      message: "Item inventory crossed reorder threshold",
    },
  ]);
  const [loading, setLoading] = React.useState(false);

  if (!isOpen) return null;

  const handleAddCondition = () => {
    setConditions([
      ...conditions,
      { field: "status", operator: "EQUALS", value: "ACTIVE" },
    ]);
  };

  const handleSaveWorkflow = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await notificationsApi.createWorkflow({
        name,
        description,
        triggerType,
        conditionsJson: conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
        actionsJson: actions.map((a) => ({
          actionType: a.actionType,
          payload: {
            title: a.title,
            message: a.message,
            module: "Inventory",
            type: "WARNING",
          },
        })),
        isActive: true,
      });

      if (onWorkflowCreated) onWorkflowCreated();
      onClose();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-10 px-4 animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Create Automation Rule
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-foreground">
              Rule Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Low Stock Alert & Buyer Assignment"
              className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md text-xs outline-none text-foreground focus:ring-1 focus:ring-primary"
            />
          </div>

          <Field>
            <FieldLabel htmlFor="wf-name">
              Workflow Rule Name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="wf-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Low Stock Alert & Buyer Assignment"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="wf-desc">Description</FieldLabel>
            <Input
              id="wf-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Automation rule purpose..."
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="wf-trigger">Trigger Event</FieldLabel>
            <Select
              value={triggerType}
              onValueChange={(val) => setTriggerType(val ?? "")}
            >
              <SelectTrigger id="wf-trigger">
                <SelectValue placeholder="Select trigger event..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INVENTORY_LOW">
                  Inventory Below Reorder Level
                </SelectItem>
                <SelectItem value="PO_SUBMITTED">
                  Purchase Order Submitted (&gt; ₹100,000)
                </SelectItem>
                <SelectItem value="IMPORT_COMPLETED">
                  Bulk Import Job Completed
                </SelectItem>
                <SelectItem value="WORK_ORDER_DELAYED">
                  Work Order Production Delayed
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Conditions Section */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Conditions (IF)
              </label>
              <button
                type="button"
                onClick={handleAddCondition}
                className="text-[11px] text-primary flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3 h-3" />
                Add Condition
              </button>
            </div>

            {conditions.map((cond, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  type="text"
                  value={cond.field}
                  onChange={(e) => {
                    const next = [...conditions];
                    next[idx]!.field = e.target.value;
                    setConditions(next);
                  }}
                  placeholder="field"
                  className="w-1/3 h-8 text-xs"
                />
                <Select
                  value={cond.operator}
                  onValueChange={(val) => {
                    const next = [...conditions];
                    next[idx]!.operator = val ?? "";
                    setConditions(next);
                  }}
                >
                  <SelectTrigger className="w-1/3 h-8 text-xs">
                    <SelectValue placeholder="Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EQUALS">EQUALS</SelectItem>
                    <SelectItem value="GREATER_THAN">GREATER THAN</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  value={cond.value}
                  onChange={(e) => {
                    const next = [...conditions];
                    next[idx]!.value = e.target.value;
                    setConditions(next);
                  }}
                  placeholder="value"
                  className="w-1/3 h-8 text-xs"
                />
              </div>
            ))}
          </div>

          {/* Actions Section */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-xs font-semibold text-foreground">
              Actions (THEN)
            </label>
            <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-2 text-xs">
              <span className="font-semibold text-primary">
                Create System Notification
              </span>
              <input
                type="text"
                value={actions[0]!.title}
                onChange={(e) => {
                  const next = [...actions];
                  next[0]!.title = e.target.value;
                  setActions(next);
                }}
                placeholder="Notification Title"
                className="w-full px-2.5 py-1 bg-input border border-border rounded text-xs text-foreground outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSaveWorkflow}
            disabled={loading || !name.trim()}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save Automation Rule
          </Button>
        </div>
      </div>
    </div>
  );
}
