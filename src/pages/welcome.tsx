import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { WearableAddCard } from "@/components/wearable-add-card";
import { WearableFileInputButton } from "@/components/wearable-file-input-button";
import { useCreateWearables, useMe, useUpdateAvatarImage } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, useFormContext, useWatch, type Control } from "react-hook-form";
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Navigate, useNavigate } from "react-router";
import { z } from "zod";

const formSchema = z.object({
  avatarImageFile: z.instanceof(File, { message: "A picture is required to continue" }),
  /** Raw uncropped image data. */
  avatarImageBitmap: z.instanceof(ImageBitmap),
  /** Matches {@link PercentCrop} type. */
  avatarImageCrop: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    unit: z.literal("%"),
  }),
  wearables: z.array(
    z.object({
      file: z.instanceof(File),
      preview: z.string(),
      category: z.enum(["upper_body", "lower_body"]),
      description: z.string().min(1, { message: "Required" }),
    }),
  ),
});
type FormFieldValues = z.infer<typeof formSchema>;

export function WelcomePage() {
  const { data: me } = useMe();
  const { mutateAsync: updateAvatarImage, isPending: isAvatarUploadPending } =
    useUpdateAvatarImage();
  const { mutateAsync: createWearables, isPending: isWearablesUploadPending } =
    useCreateWearables();
  const isPending = isAvatarUploadPending || isWearablesUploadPending;

  const form = useForm<FormFieldValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      avatarImageFile: undefined,
      avatarImageBitmap: undefined,
      avatarImageCrop: undefined,
      wearables: [],
    },
  });
  const wearablesFieldArray = useFieldArray({
    control: form.control,
    name: "wearables",
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  if (me?.avatar_image_url) {
    return <Navigate to="/" />;
  }

  function onWearablesFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.target.files) {
      wearablesFieldArray.append(
        Array.from(e.target.files).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          category: undefined as any,
          description: "",
        })),
      );
    }
  }

  async function onSubmit(data: FormFieldValues) {
    const croppedImage = await cropImage(data.avatarImageBitmap, data.avatarImageCrop);

    await updateAvatarImage(croppedImage);

    try {
      await createWearables(
        data.wearables.map(({ category, description, file }) => ({
          category: category,
          description: description,
          image: file,
        })),
      );
    } catch (e) {
      toast({
        title: "Hmmm",
        description:
          "Failed to upload your clothes, but your selfie still made it through. Try adding your clothing items again.",
      });
    }

    // As long as avatar update succeeded, we're good to continue. If wearable upload failed, it's
    // not ideal but not a blocker (error message should be shown and user can add wearables later)
    navigate("/");
    toast({
      title: "Tada!",
      description: "Here's your brand new wardrobe ✨",
    });
  }

  return (
    <div className="mx-auto max-w-4xl p-12">
      <div className="mb-12 flex justify-center">
        <p className="text-muted-foreground">Welcome to dressme! Let's get you started.</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">
              <span className="mr-2 inline-block h-8 w-8 rounded-full bg-primary text-center text-primary-foreground">
                1
              </span>
              Upload a picture of yourself
            </h2>
            <AvatarPicker formControl={form.control} />
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">
              <span className="mr-2 inline-block h-8 w-8 rounded-full bg-primary text-center text-primary-foreground">
                2
              </span>
              Add some pics of your clothes
            </h2>
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
                <WearableFileInputButton onChange={onWearablesFileInputChange} />
              </div>
              <FormDescription>
                These can be product images or just quick snaps. You can always add more later.
              </FormDescription>
            </FormItem>
          </section>

          <Button type="submit" disabled={isPending} className="w-full">
            Done
          </Button>
        </form>
      </Form>
    </div>
  );
}

/** File picker for avatar image including a preview and cropping tool. */
function AvatarPicker({ formControl }: { formControl: Control<FormFieldValues> }) {
  const [imageObjectURL, setImageObjectURL] = useState<string | null>(null);

  const form = useFormContext<FormFieldValues>();
  const imageFile = useWatch({ control: formControl, name: "avatarImageFile" });
  const crop = useWatch({ control: formControl, name: "avatarImageCrop" });

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
        name="avatarImageFile"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    field.onChange(e.target.files.item(0));
                  }
                }}
                className="max-w-64"
              />
            </FormControl>
            <FormDescription>
              This can be any picture that contains your full body, but it shouldn't contain other
              people. Be aware that this picture currently <b>cannot be changed</b> after uploading.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      {imageObjectURL ? (
        <FormField
          control={formControl}
          name="avatarImageCrop"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => field.onChange(percentCrop)}
                  aspect={3 / 4}
                  ruleOfThirds
                  className="max-h-[75vh]"
                >
                  <img
                    src={imageObjectURL}
                    alt="Crop preview of your pic"
                    onLoad={async (e) => {
                      const { naturalWidth: width, naturalHeight: height } = e.currentTarget;

                      // Clean up old bitmap if it exists
                      let bitmap = form.getValues("avatarImageBitmap");
                      if (bitmap) {
                        bitmap.close();
                      }

                      // Create new bitmap
                      // TODO: this seems to create a much larger file than the original in some cases
                      bitmap = await createImageBitmap(e.currentTarget);
                      form.setValue("avatarImageBitmap", bitmap);

                      // Initialize the crop to maximum size, centered and with 3/4 aspect ratio
                      const crop = centerCrop(
                        makeAspectCrop({ unit: "%", height: 100 }, 3 / 4, width, height),
                        width,
                        height,
                      );

                      field.onChange(crop);
                    }}
                  />
                </ReactCrop>
              </FormControl>
              <FormDescription>
                You can crop the pic if you want to. It has to be this aspect ratio though.
              </FormDescription>
            </FormItem>
          )}
        />
      ) : null}
    </>
  );
}

/** Create a new image by applying the given crop to the given image. */
async function cropImage(image: ImageBitmap, crop: PercentCrop): Promise<Blob> {
  const canvas = new OffscreenCanvas(0, 0);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No 2d context");
  }

  canvas.width = Math.floor((crop.width / 100) * image.width);
  canvas.height = Math.floor((crop.height / 100) * image.height);

  ctx.imageSmoothingQuality = "high";

  const cropX = (crop.x / 100) * image.width;
  const cropY = (crop.y / 100) * image.height;

  // Move the crop origin to the canvas origin (0,0)
  ctx.translate(-cropX, -cropY);
  // Draw the image
  ctx.drawImage(image, 0, 0);

  return await canvas.convertToBlob();
}
