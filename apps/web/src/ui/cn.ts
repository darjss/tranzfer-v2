import { defineConfig } from "cva";
import { cn } from "cnfast";

export const { cva, cx } = defineConfig({
  hooks: {
    onComplete: (className) => cn(className),
  },
});

export { cn };
export type { VariantProps } from "cva";
