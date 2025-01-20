import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, type SubmitHandler } from "react-hook-form";

type ClothingItem = {
  id: string;
  file: File;
  preview: string;
  category?: "top" | "bottom";
  description?: string;
};

type FormData = {
  items: ClothingItem[];
};

interface AddClothesFormProps {
  onSubmit: (data: FormData) => void;
  initialStep: string;
  onStepChange: (step: string) => void;
}

export default function AddClothesForm({
  onSubmit,
  initialStep,
  onStepChange,
}: AddClothesFormProps) {
  const [dragActive, setDragActive] = useState(false);
  const { register, control, handleSubmit, watch, setValue } = useForm<FormData>({
    defaultValues: {
      items: [],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const items = watch("items");

  useEffect(() => {
    // Cleanup function to revoke the data URIs to avoid memory leaks
    return () => {
      items.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
    };
  }, [items]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      append({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file),
      });
    });
  };

  const onSubmitForm: SubmitHandler<FormData> = (data) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-8">
      {initialStep === "upload" ? (
        <div
          className={`rounded-lg border-2 border-dashed p-10 text-center ${
            dragActive ? "border-primary" : "border-gray-300"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Input type="file" multiple onChange={handleChange} className="hidden" id="file-upload" />
          <Label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">
              Drag and drop your images here, or click to select files
            </p>
          </Label>
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((item, index) => (
            <div key={item.id} className="flex items-start space-x-4 rounded-lg border p-4">
              <img
                src={item.preview || "/placeholder.svg"}
                alt="Uploaded clothing item"
                className="h-24 w-24 rounded object-cover"
              />
              <div className="flex-grow space-y-2">
                <RadioGroup
                  onValueChange={(value) =>
                    setValue(`items.${index}.category`, value as "top" | "bottom")
                  }
                  defaultValue={item.category}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="top" id={`top-${item.id}`} />
                    <Label htmlFor={`top-${item.id}`}>Top</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bottom" id={`bottom-${item.id}`} />
                    <Label htmlFor={`bottom-${item.id}`}>Bottom</Label>
                  </div>
                </RadioGroup>
                <Textarea
                  placeholder="Description (optional)"
                  {...register(`items.${index}.description`)}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between">
        {initialStep === "details" && (
          <Button type="button" variant="outline" onClick={() => onStepChange("upload")}>
            Back
          </Button>
        )}
        {items.length > 0 && (
          <Button
            type={initialStep === "details" ? "submit" : "button"}
            onClick={() => {
              if (initialStep === "upload") {
                onStepChange("details");
              }
            }}
          >
            {initialStep === "upload" ? "Next" : "Submit"}
          </Button>
        )}
      </div>
    </form>
  );
}
