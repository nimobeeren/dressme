import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect } from "react";
import { Control, FieldPath, FieldValues, useFormContext } from "react-hook-form";

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

export function WearableCategoryFormField<TFieldValues extends FieldValues>({
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
          <FormLabel>Category</FormLabel>
          <Select onValueChange={field.onChange} value={field.value || suggestion}>
            <FormControl>
              <SelectTrigger className="flex gap-1">
                <SelectValue placeholder={pending ? "Figuring it out..." : "Select a category"} />
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
