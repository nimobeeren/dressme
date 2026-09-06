"use client";

import type { Wearable } from "@/shared/schemas";
import { classifyWearable, createWearables } from "@/server/actions/wearables";
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
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CircleSlashIcon, LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  Control,
  FieldPath,
  FieldValues,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";

type WearableCategory = Wearable["category"];

// Record ensures every WearableCategory is assigned to a group.
// Adding a category to the API type without adding it here causes a type error.
const CATEGORY_TO_GROUP: Record<WearableCategory, "Tops" | "Bottoms"> = {
  "t-shirt": "Tops",
  shirt: "Tops",
  sweater: "Tops",
  jacket: "Tops",
  top: "Tops",
  pants: "Bottoms",
  shorts: "Bottoms",
  skirt: "Bottoms",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_TO_GROUP) as [WearableCategory, ...WearableCategory[]];

const CATEGORY_GROUPS = Object.entries(Object.groupBy(ALL_CATEGORIES, (c) => CATEGORY_TO_GROUP[c]));

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4 MB — fits Vercel's 4.5 MB request-body limit

const formSchema = z.object({
  wearables: z
    .array(
      z.object({
        file: z
          .instanceof(File)
          .refine(
            (f) => f.size <= MAX_UPLOAD_SIZE,
            `Image must be smaller than ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB.`,
          ),
        preview: z.string(),
        category: z.enum(ALL_CATEGORIES),
      }),
    )
    .min(1),
});

/** Auto-classification state for one wearable card, keyed by field-array ID. */
type Classification =
  | { status: "pending" }
  | { status: "done"; category: WearableCategory | null }
  | { status: "error" };

/** Page for adding wearables. Requires the user to have a generated avatar. */
export function AddClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [classifications, setClassifications] = useState<Record<string, Classification>>({});
  const [isSubmitting, startSubmitting] = useTransition();
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

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

  async function classify(fieldId: string, file: File) {
    setClassifications((prev) => ({ ...prev, [fieldId]: { status: "pending" } }));
    try {
      const formData = new FormData();
      formData.append("image", file);
      const { category, error } = await classifyWearable(formData);
      setClassifications((prev) =>
        error
          ? { ...prev, [fieldId]: { status: "error" } }
          : { ...prev, [fieldId]: { status: "done", category } },
      );
    } catch {
      setClassifications((prev) => ({ ...prev, [fieldId]: { status: "error" } }));
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (!e.target.files) return;
    wearablesFieldArray.append(
      Array.from(e.target.files).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        category: undefined as unknown as WearableCategory,
      })),
    );
  }

  function onSubmit(data: z.infer<typeof formSchema>) {
    // Each wearable is submitted in its own request so the per-image upload
    // limit is enforced independently of the batch size; a single combined
    // request would be rejected by the server action body size limit.
    startSubmitting(async () => {
      for (const [index, { category, file }] of data.wearables.entries()) {
        const formData = new FormData();
        formData.append("category", category);
        formData.append("image", file);

        setUploadProgress({ done: index, total: data.wearables.length });

        try {
          const { error } = await createWearables(formData);
          if (error) {
            toast({
              title: "Oops, something went wrong!",
              description: `Computer says: '${error}'`,
              variant: "destructive",
            });
            return;
          }
        } catch (error) {
          toast({
            title: "Oops, something went wrong!",
            description: `Computer says: '${error instanceof Error ? error.message : String(error)}'`,
            variant: "destructive",
          });
          return;
        }
      }

      router.push("/");
      const cheers = ["Nice!", "Pretty!", "Cool!", "Oooh!", "Wow!"];
      const items = data.wearables.length === 1 ? "item" : `${data.wearables.length} items`;
      toast({
        title: cheers[Math.floor(Math.random() * cheers.length)],
        description: `Added ${items} to your wardrobe.`,
      });
    });
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
                  classification={classifications[field.id]}
                  onRemove={() => wearablesFieldArray.remove(index)}
                  onClassify={classify}
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
              disabled={isSubmitting}
              variant="outline"
              className="col-span-1"
            >
              <Link href="/">
                Cancel
                <CircleSlashIcon />
              </Link>
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || wearables.length === 0}
              className="col-span-1"
            >
              Done
              {isSubmitting &&
                (uploadProgress ? (
                  <span>
                    Adding {uploadProgress.done + 1} of {uploadProgress.total}
                  </span>
                ) : (
                  <LoaderCircleIcon className="animate-spin" />
                ))}
              {!isSubmitting && <CheckIcon />}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

interface WearableAddCardProps<TFieldValues extends FieldValues> {
  /** Name of the form field (e.g. `wearables.0` or `wearables.1`). */
  name: string;
  /** Stable field ID used to key classification state. */
  fieldId: string;
  /** The image file to classify. */
  file: File;
  /** Preview image source. */
  previewSrc: string;
  /** Form control. */
  control: Control<TFieldValues>;
  /** Auto-classification state for this card. */
  classification: Classification | undefined;
  /** Callback for when remove button is clicked. */
  onRemove: () => void;
  /** Callback that starts auto-classification for this card. */
  onClassify: (fieldId: string, file: File) => void;
}

/** A card representing a single wearable to be added. */
function WearableAddCard<TFieldValues extends FieldValues>({
  name,
  fieldId,
  file,
  previewSrc,
  control,
  classification,
  onRemove,
  onClassify,
}: WearableAddCardProps<TFieldValues>) {
  // Kick off classification once, on mount; the result arrives via props.
  useEffect(() => {
    onClassify(fieldId, file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="group relative w-64">
      <Card className="flex flex-col overflow-hidden">
        <img src={previewSrc} className="aspect-3/4 object-cover" />
        <CategoryFormField
          control={control}
          name={`${name}.category` as FieldPath<TFieldValues>}
          suggestion={
            classification?.status === "done" ? (classification.category ?? undefined) : undefined
          }
          pending={classification?.status === "pending"}
        />
      </Card>
      <Button
        type="button"
        variant="outline"
        aria-label="Remove"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 size-10 -translate-y-1/2 translate-x-1/2 rounded-full opacity-0 duration-75 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <Trash2Icon className="!size-6" />
      </Button>
    </div>
  );
}

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
              {CATEGORY_GROUPS.map(([label, options]) => (
                <SelectGroup key={label}>
                  <SelectLabel>{label}</SelectLabel>
                  {options.map((option) => (
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
