import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { WearableCategoryFormField } from "@/components/wearable-category-form-field";
import { useCreateWearables, useMe, useUpdateAvatarImage } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { z } from "zod";

const formSchema = z.object({
  image: z.instanceof(File),
  wearables: z
    .array(
      z.object({
        file: z.instanceof(File),
        preview: z.string(),
        category: z.enum(["upper_body", "lower_body"]),
        description: z.string(),
      }),
    )
    .min(1),
});

export function WelcomePage() {
  const { data: me } = useMe();
  const { mutateAsync: updateAvatarImage, isPending: isAvatarUploadPending } =
    useUpdateAvatarImage();
  const { mutateAsync: createWearables, isPending: isWearablesUploadPending } =
    useCreateWearables();
  const isPending = isAvatarUploadPending || isWearablesUploadPending;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      image: undefined,
      wearables: [],
    },
  });
  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "wearables",
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  if (me?.has_avatar_image) {
    return <Navigate to="/" />;
  }

  function onWearablesFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.target.files) {
      replace(
        Array.from(e.target.files).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          category: undefined as any,
          description: "",
        })),
      );
    }
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    // Kick off both mutations in parallel
    const avatarUploadPromise = updateAvatarImage(data.image);
    const wearablesUploadPromise = createWearables(
      data.wearables.map(({ category, description, file }) => ({
        category: category,
        description: description,
        image: file,
      })),
    );

    // Wait for both mutations to finish
    const [avatarUploadResult, _] = await Promise.allSettled([
      avatarUploadPromise,
      wearablesUploadPromise,
    ]);

    // If avatar upload succeeded, we're good to continue
    // If wearable upload failed, it's not ideal but not a blocker
    // (error message should be shown and user can add wearables later)
    // TODO: if avatar fails but wearables succeed, the user will probably upload the same wearables
    // again, leading to duplicates. We can't easily roll back either because image generation has
    // likely already been kicked off. Need to build a better solution.
    if (avatarUploadResult.status === "fulfilled") {
      navigate("/");
      toast({
        title: "Success!",
        description: "Here's your brand new wardrobe ✨",
      });
    }
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Welcome! Let's get started</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Upload a pic of yourself</h2>
            <AvatarUploader formControl={form.control} />
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. Add some clothes</h2>
            <Input type="file" multiple accept="image/*" onChange={onWearablesFileInputChange} />

            <div className="grid grid-cols-2 gap-4">
              {fields.map((wearable, index) => (
                <Card key={wearable.id} className="flex flex-row">
                  <img src={wearable.preview} className="aspect-3/4 h-64 object-cover" />
                  <div className="space-y-8 p-8">
                    <WearableCategoryFormField
                      control={form.control}
                      name={`wearables.${index}.category`}
                    />
                    <FormField
                      control={form.control}
                      name={`wearables.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <Button type="submit" disabled={isPending}>
            Upload All
          </Button>
        </form>
      </Form>
    </div>
  );
}

function AvatarUploader({ formControl }: { formControl: Control<any> }) {
  const [imageObjectURL, setImageObjectURL] = useState<string | null>(null);

  const imageFile = useWatch({ control: formControl, name: "image" });

  useEffect(() => {
    if (imageFile instanceof File) {
      const url = URL.createObjectURL(imageFile);
      setImageObjectURL(url);

      return () => URL.revokeObjectURL(url);
    } else {
      setImageObjectURL(null);
    }
  }, [imageFile]);

  return (
    <>
      <FormField
        control={formControl}
        name="image"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    field.onChange(e.target.files.item(0));
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {imageObjectURL && (
        <div className="w-64 overflow-hidden rounded-md">
          <img src={imageObjectURL} alt="Image Preview" className="object-fit" />
        </div>
      )}
    </>
  );
}
