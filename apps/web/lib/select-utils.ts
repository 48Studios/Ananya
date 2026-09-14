import * as React from "react";

export function extractSelectItems(
  children: React.ReactNode,
): Array<{ value: unknown; label: React.ReactNode }> {
  const items: Array<{ value: unknown; label: React.ReactNode }> = [];
  const seen = new Set<unknown>();

  function traverse(node: React.ReactNode) {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;

      const props = child.props as Record<string, unknown> | null;
      if (props && "value" in props && props.value !== undefined) {
        const val = props.value;
        const label =
          props.label !== undefined
            ? (props.label as React.ReactNode)
            : props.children !== undefined
              ? (props.children as React.ReactNode)
              : (props.value as React.ReactNode);

        if (!seen.has(val)) {
          seen.add(val);
          items.push({ value: val, label });

          // Support loose matching for number <-> string values
          if (
            typeof val === "string" &&
            !isNaN(Number(val)) &&
            val.trim() !== ""
          ) {
            const num = Number(val);
            if (!seen.has(num)) {
              seen.add(num);
              items.push({ value: num, label });
            }
          } else if (typeof val === "number") {
            const str = String(val);
            if (!seen.has(str)) {
              seen.add(str);
              items.push({ value: str, label });
            }
          }
        }
      }

      if (props && props.children) {
        traverse(props.children as React.ReactNode);
      }
    });
  }

  traverse(children);
  return items;
}
