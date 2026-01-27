import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Control, FieldPath, FieldValues } from "react-hook-form";

// Define props similar to FormField, constrained to what we need
interface CategoryFormFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
}

export function WearableCategoryFormField<TFieldValues extends FieldValues>({
  control,
  name,
}: CategoryFormFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Category</FormLabel>
          <FormControl>
            <RadioGroup
              className="flex space-x-4"
              onValueChange={field.onChange}
              value={field.value}
            >
              <FormItem className="flex items-center space-x-2 space-y-0">
                <FormControl>
                  <RadioGroupItem value="upper_body" />
                </FormControl>
                <FormLabel>Top</FormLabel>
              </FormItem>
              <FormItem className="flex items-center space-x-2 space-y-0">
                <FormControl>
                  <RadioGroupItem value="lower_body" />
                </FormControl>
                <FormLabel>Bottom</FormLabel>
              </FormItem>
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
