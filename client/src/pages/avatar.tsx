import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useUpdateAvatarImage } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";

const formSchema = z.object({
  image: z.instanceof(File),
});

// LEFT HERE
// TODO: change this to a welcome page instead where you can upload an avatar image as well as some wearables

export function AvatarPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { mutate: updateAvatarImage } = useUpdateAvatarImage();

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      image: undefined,
    },
  });
  const imageFile = useWatch({ control: form.control, name: "image" });

  useEffect(() => {
    if (imageFile instanceof File) {
      const url = URL.createObjectURL(imageFile);
      setImagePreview(url);

      return () => URL.revokeObjectURL(url);
    } else {
      setImagePreview(null);
    }
  }, [imageFile]);

  function onSubmit(data: z.infer<typeof formSchema>) {
    updateAvatarImage(data.image, {
      onSuccess: async () => {
        navigate("/");
        toast({
          title: "Success!",
          description: "Your pic has been uploaded.",
        });
      },
    });
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Upload a pic of yourself</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
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

          {imagePreview && (
            <div className="w-64 overflow-hidden rounded-md">
              <img src={imagePreview} alt="Image Preview" className="object-fit" />
            </div>
          )}
          <Button type="submit">Upload Image</Button>
        </form>
      </Form>
    </div>
  );
}
