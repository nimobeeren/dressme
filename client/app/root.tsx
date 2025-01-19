import { client } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangleIcon, BanIcon, HelpCircleIcon } from "lucide-react";
import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
} from "react-router";
import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
});

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const navigate = useNavigate();

  useEffect(() => {
    console.error("Error caught by error boundary:", error);
  }, [error]);

  let title: string;
  let message: string;
  let Icon: React.ElementType;
  let stackTrace: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data;
    Icon = BanIcon;
  } else if (error instanceof Error) {
    title = "Application Error";
    message = error.message;
    stackTrace = error.stack;
    Icon = AlertTriangleIcon;
  } else {
    title = "Unknown Error";
    message = "Oops, something went wrong!";
    Icon = HelpCircleIcon;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-4">
            <Icon className="h-8 w-8 flex-shrink-0 sm:h-12 sm:w-12" />
            <CardTitle className="text-2xl font-bold">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 w-screen max-w-md text-muted-foreground">{message}</div>
          {stackTrace && (
            <div className="mt-4 max-w-3xl">
              <pre className="max-h-96 overflow-x-auto rounded-md bg-muted p-4 text-xs">
                {stackTrace}
              </pre>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={() => navigate(0)} className="w-full">
            Try Again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function App() {
  // const { toast } = useToast();

  // TODO: generic error handling for actions
  // useMemo(() => {
  //   queryClient.setDefaultOptions({
  //     mutations: {
  //       onError: (error) => {
  //         console.error(error);
  //         toast({
  //           title: "Oops, something went wrong!",
  //           description: `Computer says: '${error.message}'`,
  //           variant: "destructive",
  //         });
  //       },
  //     },
  //   });
  // }, [toast]);

  return (
    <Outlet />
    // <Toaster />
  );
}
