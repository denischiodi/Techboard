import * as React from "react";

import { cn } from "@/lib/utils";

type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "defaultChecked" | "onChange"
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  value?: string;
  required?: boolean;
  form?: string;
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked,
      defaultChecked = false,
      onCheckedChange,
      onClick,
      disabled,
      name,
      value = "on",
      required,
      form,
      ...props
    },
    ref
  ) => {
    const [uncontrolledChecked, setUncontrolledChecked] =
      React.useState(defaultChecked);
    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : uncontrolledChecked;
    const state = isChecked ? "checked" : "unchecked";

    return (
      <>
        <button
          ref={ref}
          type="button"
          role="switch"
          aria-checked={isChecked}
          data-slot="switch"
          data-state={state}
          disabled={disabled}
          className={cn(
            "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          onClick={event => {
            onClick?.(event);
            if (event.defaultPrevented || disabled) return;
            const nextChecked = !isChecked;
            if (!isControlled) setUncontrolledChecked(nextChecked);
            onCheckedChange?.(nextChecked);
          }}
          {...props}
        >
          <span
            data-slot="switch-thumb"
            data-state={state}
            className="bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
          />
        </button>
        {name ? (
          <input
            type="checkbox"
            aria-hidden="true"
            tabIndex={-1}
            className="hidden"
            name={name}
            value={value}
            checked={isChecked}
            required={required}
            disabled={disabled}
            form={form}
            readOnly
          />
        ) : null}
      </>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
