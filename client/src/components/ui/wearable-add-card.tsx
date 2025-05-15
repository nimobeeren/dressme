import { Trash2Icon } from "lucide-react";
import type { Control } from "react-hook-form";
import { WearableCategoryFormField } from "../wearable-category-form-field";
import { Button } from "./button";
import { Card } from "./card";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { Input } from "./input";

export interface WearableAddCardProps {
  /** Name of the form field (e.g. `wearables.0` or `wearables.1). */
  name: string;
  /** Preview image source. */
  previewSrc: string;
  /** Form control. */
  control: Control<any>;
  /** Callback for when remove button is clicked. */
  onRemove: () => void;
}

export function WearableAddCard({ name, previewSrc, control, onRemove }: WearableAddCardProps) {
  return (
    <Card className="group relative flex h-64 flex-row">
      <img src={previewSrc} className="aspect-3/4 object-cover" />
      <div className="space-y-4 overflow-y-auto px-6 py-4">
        <WearableCategoryFormField control={control} name={`${name}.category`} />
        <FormField
          control={control}
          name={`${name}.description`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                One or two words describing the item (like shirt or pants).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 size-10 -translate-y-1/2 translate-x-1/2 rounded-full opacity-0 duration-75 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon className="!size-6" />
      </Button>
    </Card>
  );
}
