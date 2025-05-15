import { Button } from "@/components/ui/button";
import { Form, FormDescription, FormItem } from "@/components/ui/form";
import { WearableAddCard } from "@/components/ui/wearable-add-card";
import { WearableFileInputButton } from "@/components/ui/wearable-file-input-button";
import { useCreateWearables } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CircleSlashIcon, LoaderCircleIcon } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";

const formSchema = z.object({
  wearables: z
    .array(
      z.object({
        file: z.instanceof(File),
        preview: z.string(),
        category: z.enum(["upper_body", "lower_body"]),
        description: z.string().min(1, { message: "Required" }),
      }),
    )
    .min(1),
});

export function AddPage() {
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

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.target.files) {
      wearablesFieldArray.replace(
        Array.from(e.target.files).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          // Undefined is invalid when submitting the form but fine as an initial value
          category: undefined as any,
          description: "",
        })),
      );
    }
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    createWearables(
      // Rename file field and keep only necessary fields
      data.wearables.map(({ category, description, file }) => ({
        category: category,
        description: description,
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
            <div className="grid grid-cols-2 gap-4">
              {wearablesFieldArray.fields.map((wearable, index) => (
                <WearableAddCard
                  key={wearable.id}
                  name={`wearables.${index}`}
                  previewSrc={wearable.preview}
                  control={form.control}
                  onRemove={() => wearablesFieldArray.remove(index)}
                />
              ))}
              <WearableFileInputButton onChange={onFileInputChange} />
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
