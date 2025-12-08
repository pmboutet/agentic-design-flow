import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button component variants using class-variance-authority
 * Provides consistent styling across different button types
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-white/20 bg-slate-900/50 text-white hover:bg-slate-800/60 hover:border-white/30 backdrop-blur-sm",
        secondary:
          "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50 backdrop-blur-sm",
        ghost: "text-foreground hover:bg-white/10 hover:text-white",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "border border-white/20 bg-white/10 text-foreground hover:bg-white/20 hover:text-foreground backdrop-blur-sm",
        glassDark: "border border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Reusable Button component with multiple variants and sizes
 * Can be used as a child component with asChild prop
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
