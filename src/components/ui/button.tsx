import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        filter: "relative rounded-none text-xs text-muted-foreground hover:text-foreground sm:text-sm data-[state=on]:text-foreground data-[state=on]:after:absolute data-[state=on]:after:inset-x-0 data-[state=on]:after:bottom-0 data-[state=on]:after:h-0.5 data-[state=on]:after:bg-current",
        hero: "rounded-full bg-primary text-primary-foreground hover:bg-primary/85",
        quiet: "rounded-full text-foreground hover:bg-muted",
      },
      size: {
        default: "px-4 py-2",
        compact: "px-1 py-2 sm:px-4",
        icon: "size-11 shrink-0 p-0",
        text: "px-0 py-2",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  asChild = false, className, variant, size, ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
