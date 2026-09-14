import { defineConfig } from "cva";
import { cn } from "cnfast";

export { cn } from "cnfast";
export type { VariantProps } from "cva";

export const { cva, cx } = defineConfig({
  hooks: {
    onComplete: (className) => cn(className),
  },
});
