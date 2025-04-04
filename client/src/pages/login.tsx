import { Button } from "@/components/ui/button";
import { useAuth0 } from "@auth0/auth0-react";

export function Login() {
  const { loginWithRedirect } = useAuth0();
  return <Button onClick={() => loginWithRedirect()}>Log in</Button>;
}
