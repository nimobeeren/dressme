import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";

/** Temporary component for testing auth */
export const Profile = () => {
  const { getAccessTokenSilently, user, isAuthenticated, isLoading } = useAuth0();

  useEffect(() => {
    getAccessTokenSilently().then((token) => {
      console.log({ token });
    });
  }, [getAccessTokenSilently]);

  if (isLoading) {
    return <div>Loading ...</div>;
  }

  return (
    isAuthenticated &&
    user && (
      <div>
        <img src={user.picture} alt={user.name} />
        <h2>{user.name}</h2>
        <p>{user.email}</p>
      </div>
    )
  );
};
