import { assetPath } from "@/const";
import type { ProductDefinition } from "@/lib/productCatalog";
import { cn } from "@/lib/utils";

type ProductLogoProps = {
  product: Pick<ProductDefinition, "name" | "logoPath" | "icon" | "iconClass">;
  className?: string;
  imageClassName?: string;
  compact?: boolean;
};

export function ProductLogo({ product, className, imageClassName, compact = false }: ProductLogoProps) {
  const Icon = product.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white shadow-sm", compact ? "h-9 w-9" : "h-14 w-36", className)}>
      <img
        src={assetPath(product.logoPath)}
        alt={`Logo ${product.name}`}
        className={cn("h-full w-full object-contain", compact ? "p-1" : "p-2", imageClassName)}
        onError={event => {
          event.currentTarget.hidden = true;
          event.currentTarget.nextElementSibling?.classList.remove("hidden");
        }}
      />
      <Icon className={cn("hidden h-5 w-5", product.iconClass)} aria-hidden="true" />
    </span>
  );
}
