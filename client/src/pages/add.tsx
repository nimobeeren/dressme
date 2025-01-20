import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldArray, useForm } from "react-hook-form";

type ClothingItem = {
  id: string;
  file: File;
  preview: string;
  category?: "top" | "bottom";
  description?: string;
};

type FormData = {
  wearables: ClothingItem[];
};

export function Add() {
  const { register, control, handleSubmit } = useForm<FormData>({
    defaultValues: {
      // TODO: revert
      // wearables: []
      wearables: [
        {
          id: Math.random().toString(36).slice(2, 9),
          file: new File([], "test"),
          preview: "http://localhost:8000/images/wearables/72f043bf-63f4-4719-aa3b-d5f0aafd587e",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "wearables",
  });

  const handleFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      append({
        id: Math.random().toString(36).slice(2, 9),
        file,
        preview: URL.createObjectURL(file),
      });
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Add Clothing Items</h1>
      <form className="space-y-8">
        <Input type="file" multiple onChange={handleChange} {...register} />

        {fields.map((wearable) => (
          <Card key={wearable.id} className="flex flex-row">
            <img src={wearable.preview} className="aspect-3/4 h-64 object-cover" />
            <div className="p-8">
              <div className="space-y-2">
                {/* LEFT HERE */}
                {/* TODO: make this a radio group (or even better: use the same UI as tabs) */}
                <Label htmlFor={`wearable:${wearable.id}:category`}>Category</Label>
                <Input id={`wearable:${wearable.id}:category`} {...register} />
              </div>
            </div>
          </Card>
        ))}
      </form>
    </div>
  );
}
