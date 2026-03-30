import { FullPageSpinner } from "@/components/full-page-spinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClassifyWearable, useCreateWearables, useMe } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CircleSlashIcon, LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import {
  Control,
  FieldPath,
  FieldValues,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router";
import { z } from "zod";

const formSchema = z.object({
  wearables: z
    .array(
      z.object({
        file: z.instanceof(File),
        preview: z.string(),
        category: z.enum([
          "t-shirt",
          "shirt",
          "sweater",
          "jacket",
          "top",
          "pants",
          "shorts",
          "skirt",
        ]),
      }),
    )
    .min(1),
});

/** Page for adding wearables. */
export function AddPage() {
  const { data: me, isPending: meIsPending } = useMe();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { mutate: createWearables, isPending } = useCreateWearables();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      wearables: [],
    },
  });

  const wearablesFieldArray = useFieldArray({
    control: form.control,
    name: "wearables",
  });

  const wearables = useWatch({ control: form.control, name: "wearables" });

  if (meIsPending) {
    return <FullPageSpinner />;
  }

  if (me && !me.has_avatar_image) {
    return <Navigate to="/" />;
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.target.files) {
      wearablesFieldArray.append(
        Array.from(e.target.files).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          // Undefined is invalid when submitting the form but fine as an initial value
          category: undefined as any,
        })),
      );
    }
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    createWearables(
      data.wearables.map(({ category, file }) => ({
        category,
        image: file,
      })),
      {
        onSuccess: async () => {
          navigate("/");
          const cheers = ["Nice!", "Pretty!", "Cool!", "Oooh!", "Wow!"];
          toast({
            title: cheers[Math.floor(Math.random() * cheers.length)],
            description: "Added item to your wardrobe.",
          });
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-12">
      <div className="mb-12 flex justify-center">
        <p className="text-muted-foreground">Let's add some clothes!</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormItem>
            <div className="flex gap-4">
              {wearablesFieldArray.fields.map((field, index) => (
                <WearableAddCard
                  key={field.id}
                  name={`wearables.${index}`}
                  fieldId={field.id}
                  file={field.file}
                  previewSrc={field.preview}
                  control={form.control}
                  onRemove={() => wearablesFieldArray.remove(index)}
                />
              ))}
              <FileInputButton onChange={onFileInputChange} />
            </div>
            <FormDescription>These can be product images or just quick snaps.</FormDescription>
          </FormItem>
          <div className="grid w-full grid-cols-2 gap-4">
            <Button
              asChild
              type="button"
              disabled={isPending}
              variant="outline"
              className="col-span-1"
            >
              <Link to="/">
                Cancel
                <CircleSlashIcon />
              </Link>
            </Button>
            <Button
              type="submit"
              disabled={isPending || wearables.length === 0}
              className="col-span-1"
            >
              Done
              {isPending ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

interface WearableAddCardProps {
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

/** A card representing a single wearable to be added. */
function WearableAddCard({
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
              <SelectTrigger
                aria-label="Category"
                className="h-auto rounded-t-none border-none focus:ring-inset"
              >
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

interface WearableFileInputButtonProps {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A large button with a plus icon used to upload wearable image files.
 *
 * The native file input is hidden and the button is used to trigger it.
 */
function FileInputButton({ onChange }: WearableFileInputButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      tabIndex={-1}
      className="relative aspect-3/4 h-auto w-64 border-2 p-4 text-6xl text-foreground"
    >
      <PlusIcon className="!size-12" />
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={onChange}
        className="absolute inset-0 text-[0px] text-transparent file:hidden"
      />
    </Button>
  );
}
