import { useClassifyWearable } from "@/hooks/api";
import { Trash2Icon } from "lucide-react";
import type { Control } from "react-hook-form";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { WearableCategoryFormField } from "./wearable-category-form-field";

export interface WearableAddCardProps {
  /** Name of the form field (e.g. `wearables.0` or `wearables.1`). */
  name: string;
  /** Stable field ID used as query key. */
  fieldId: string;
  /** The image file to classify. */
  file: File;
  /** Preview image source. */
  previewSrc: string;
  /** Form control. */
  control: Control<any>;
  /** Callback for when remove button is clicked. */
  onRemove: () => void;
}

export function WearableAddCard({
  name,
  fieldId,
  file,
  previewSrc,
  control,
  onRemove,
}: WearableAddCardProps) {
  const classifyQuery = useClassifyWearable(file, fieldId);

  return (
    <div className="group relative">
      <Card className="flex h-64 flex-row overflow-hidden">
        <img src={previewSrc} className="aspect-3/4 object-cover" />
        <div className="w-full space-y-4 overflow-y-auto px-6 py-4">
          <WearableCategoryFormField
            control={control}
            name={`${name}.category`}
            suggestion={classifyQuery.data?.category ?? undefined}
            pending={classifyQuery.isPending}
          />
        </div>
      </Card>
      <Button
        type="button"
        variant="outline"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 size-10 -translate-y-1/2 translate-x-1/2 rounded-full opacity-0 duration-75 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon className="!size-6" />
      </Button>
    </div>
  );
}
