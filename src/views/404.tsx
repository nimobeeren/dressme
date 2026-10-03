"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export function NotFoundPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center space-x-4">
            <HelpCircleIcon className="text-warning h-8 w-8 flex-shrink-0 sm:h-12 sm:w-12" />
            <CardTitle className="text-2xl font-bold">Huh?</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 text-muted-foreground">What were you even looking for?</div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => router.back()} className="w-full">
            Go back
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
