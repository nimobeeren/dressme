import { LoaderCircleIcon } from "lucide-react";

export function FullPageSpinner() {
  return (
    <div className="animate-delayed-appear flex h-screen w-full items-center justify-center">
      <LoaderCircleIcon className="h-16 w-16 animate-spin" />
    </div>
  );
}
