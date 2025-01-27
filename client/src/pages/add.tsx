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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  wearables: z.array(
    z.object({
      file: z.instanceof(File),
      preview: z.string(),
      category: z.enum(["top", "bottom"], {
        required_error: "Every item needs to have a category",
      }),
      description: z.string().default(""),
    }),
  ),
});

export function Add() {
  // TODO
  // const { mutate: addWearable } = useAddWearable();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "wearables",
  });

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      Array.from(e.target.files).forEach((file) => {
        append({
          file,
          preview: URL.createObjectURL(file),
          // @ts-expect-error this does not pass validation but that's okay because it's just a default value
          category: undefined,
          description: "", // needed to prevent React uncontrolled to controlled component warning
        });
      });
    }
  };

  async function onSubmit(data: z.infer<typeof formSchema>) {
    console.log("submitting", data);
  }

  form.watch((data) => console.log("watch", JSON.stringify(data, null, 2)));

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Add Your Clothes</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* This field is not registered to the form, instead the value is captured in `onChange`
        and set with `useFieldArray` */}
          <Input type="file" multiple onChange={onFileInputChange} />

          {fields.map((wearable, index) => (
            <Card key={wearable.id} className="flex flex-row">
              <img src={wearable.preview} className="aspect-3/4 h-64 object-cover" />
              <div className="space-y-8 p-8">
                <FormField
                  control={form.control}
                  name={`wearables.${index}.category`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <RadioGroup
                          className="flex space-x-4"
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="top" />
                            </FormControl>
                            <FormLabel>Top</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="bottom" />
                            </FormControl>
                            <FormLabel>Bottom</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`wearables.${index}.description`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <Input {...field} />
                    </FormItem>
                  )}
                />
              </div>
            </Card>
          ))}
          <Button type="submit">Add</Button>
        </form>
      </Form>
    </div>
  );
}
