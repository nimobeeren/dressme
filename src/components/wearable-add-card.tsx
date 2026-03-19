import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClassifyWearable } from "@/hooks/api";
import { Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { Control, FieldPath, FieldValues, useFormContext } from "react-hook-form";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

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
    <div className="group relative w-64">
      <Card className="flex flex-col overflow-hidden">
        <img src={previewSrc} className="aspect-3/4 object-cover" />
        <CategoryFormField
          control={control}
          name={`${name}.category`}
          suggestion={classifyQuery.data?.category ?? undefined}
          pending={classifyQuery.isPending}
        />
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

const CATEGORY_GROUPS = [
  { label: "Tops", options: ["t-shirt", "shirt", "sweater", "jacket", "top"] },
  { label: "Bottoms", options: ["pants", "shorts", "skirt"] },
] as const;

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface CategoryFormFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  /** Suggested value from auto-classification. Applied once if the user hasn't picked a value. */
  suggestion?: string;
  pending?: boolean;
}

function CategoryFormField<TFieldValues extends FieldValues>({
  control,
  name,
  suggestion,
  pending,
}: CategoryFormFieldProps<TFieldValues>) {
  const { setValue, getValues } = useFormContext();

  // Apply suggestion to form state so it participates in validation/submission
  useEffect(() => {
    if (suggestion && !getValues(name)) {
      setValue(name, suggestion as any);
    }
  }, [suggestion, name, setValue, getValues]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <Select onValueChange={field.onChange} value={field.value || suggestion}>
            <FormControl>
              <SelectTrigger aria-label="Category" className="h-auto rounded-none border-none">
                <SelectValue
                  placeholder={pending ? "Determining category..." : "Please select a category"}
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {CATEGORY_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {capitalize(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
