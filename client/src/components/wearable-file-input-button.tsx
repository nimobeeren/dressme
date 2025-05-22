import { PlusIcon } from "lucide-react";
import { Button } from "./ui/button";

export interface WearableFileInputButtonProps {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A button large button with a plus icon used to upload wearable files.
 *
 * The native file input is hidden and the button is used to trigger it.
 */
export function WearableFileInputButton({ onChange }: WearableFileInputButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      tabIndex={-1}
      className="relative aspect-3/4 h-64 border-2 p-4 text-6xl text-foreground"
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
