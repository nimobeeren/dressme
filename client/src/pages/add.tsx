import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useFieldArray, useForm, type SubmitHandler } from "react-hook-form";

type ClothingItem = {
  // id: string;
  file: File;
  preview: string;
  category?: "top" | "bottom";
  description?: string;
};

type FormData = {
  wearables: ClothingItem[];
};

export function Add() {
  // TODO
  // const { mutate: addWearable } = useAddWearable();

  const { register, control, handleSubmit, watch } = useForm<FormData>({
    defaultValues: {
      // TODO: revert
      // wearables: []
      wearables: [
        {
          // id: Math.random().toString(36).slice(2, 9),
          file: new File([], "test"),
          preview: "http://localhost:8000/images/wearables/72f043bf-63f4-4719-aa3b-d5f0aafd587e",
          description: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "wearables",
  });

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      Array.from(e.target.files).forEach((file) => {
        append({
          file,
          preview: URL.createObjectURL(file),
        });
      });
    }
  };

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    console.log("submitting", data);
  };

  watch((data) => console.log("watch", JSON.stringify(data, null, 2)));

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Add Clothing Items</h1>
      <form className="space-y-8" onSubmit={handleSubmit(onSubmit)}>
        {/* This field is not registered to the form, instead the value is captured in `onChange`
        and set with `useFieldArray` */}
        <Input type="file" multiple onChange={onFileInputChange} />

        {fields.map((wearable, index) => (
          <Card key={wearable.id} className="flex flex-row">
            <img src={wearable.preview} className="aspect-3/4 h-64 object-cover" />
            <div className="space-y-8 p-8">
              <div className="space-y-2">
                <Label htmlFor={`wearables.${index}.category`}>Category</Label>
                <RadioGroup
                  className="flex space-x-4"
                  {...register(`wearables.${index}.category`, { required: true })}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="top" id={`wearables.${index}.category.top`} />
                    <Label htmlFor={`wearables.${index}.category.top`}>Top</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="top" id={`wearables.${index}.category.bottom`} />
                    <Label htmlFor={`wearables.${index}.category.bottom`}>Bottom</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`wearables.${index}.description`}>Description</Label>
                <Input
                  {...register(`wearables.${index}.description`)}
                  id={`wearables.${index}.description`}
                  type="text"
                />
              </div>
            </div>
          </Card>
        ))}
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}
