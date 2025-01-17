import { client } from "@/api";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
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
