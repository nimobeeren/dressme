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
import { useCreateWearable } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";

const formSchema = z.object({
  wearables: z.array(
    z.object({
      file: z.instanceof(File),
      preview: z.string(),
      category: z.enum(["upper_body", "lower_body"]),
      description: z.string(),
    }),
  ),
});

export function Add() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { mutate: createWearable, isPending } = useCreateWearable();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "wearables",
  });

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.target.files) {
      replace(
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
    createWearable(
      {
        category: data.wearables[0].category,
        description: data.wearables[0].description,
        image: data.wearables[0].file,
      },
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
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Add Your Clothes</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Input type="file" multiple accept="image/*" onChange={onFileInputChange} />

          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
            <Button className="col-span-1" variant="outline" type="button" asChild>
              <Link to="/">
                <ChevronLeftIcon />
                Back
              </Link>
            </Button>
            <Button className="col-span-1" type="submit" disabled={isPending}>
              Add
              {isPending ? <LoaderCircleIcon className="animate-spin" /> : <PlusIcon />}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
