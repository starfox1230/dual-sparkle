import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [@media(hover:hover)]:hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground [@media(hover:hover)]:hover:bg-destructive/90",
        outline: "border border-input bg-background [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground [@media(hover:hover)]:hover:bg-secondary/80",
        ghost: "[@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [@media(hover:hover)]:hover:underline",
        // Neon gaming variants
        neon: "bg-gradient-primary text-primary-foreground [@media(hover:hover)]:hover:shadow-glow-primary transition-all duration-300 border border-primary/50 font-orbitron font-bold",
        neonSecondary: "bg-gradient-secondary text-secondary-foreground [@media(hover:hover)]:hover:shadow-glow-secondary transition-all duration-300 border border-secondary/50 font-orbitron font-bold",
        neonSuccess: "bg-gradient-success text-success-foreground [@media(hover:hover)]:hover:shadow-glow-success transition-all duration-300 border border-success/50 font-orbitron font-bold",
        neonDanger: "bg-gradient-danger text-danger-foreground [@media(hover:hover)]:hover:shadow-glow-danger transition-all duration-300 border border-danger/50 font-orbitron font-bold",
        neonOutline: "border-2 border-primary bg-transparent text-primary [@media(hover:hover)]:hover:bg-primary [@media(hover:hover)]:hover:text-primary-foreground [@media(hover:hover)]:hover:shadow-glow-primary transition-all duration-300 font-orbitron font-bold",
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
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
