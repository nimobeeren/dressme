import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** The source URL of the image, required. */
  src: string;
}

/**
 * Image which is fetched with the current Auth0 access token.
 */
export function AuthenticatedImage(props: AuthenticatedImageProps) {
  const [token, setToken] = useState<string>();
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    getAccessTokenSilently().then((token) => setToken(token));
  }, [getAccessTokenSilently]);

  return <ImageWithToken {...props} token={token} />;
}

interface ImageWithTokenProps extends AuthenticatedImageProps {
  /** Access token to send in Authorization header. */
  token?: string;
}

/**
 * Image which is fetched with a given access token. If no token is passed, the image will not be
 * fetched and an empty image will be rendered.
 */
function ImageWithToken({ src, token, ...restProps }: ImageWithTokenProps) {
  const [objectURL, setObjectURL] = useState<string>();

  useEffect(() => {
    const fetchImage = async (src: string, token: string) => {
      try {
        const response = await fetch(src, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setObjectURL(url);
      } catch (error) {
        console.error("Error fetching image", { error, src });
      }
    };

    // The image won't be fetched until a token is available
    if (token) {
      fetchImage(src, token);
    }
  }, [src, token]);

  useEffect(() => {
    return () => {
      if (objectURL) {
        URL.revokeObjectURL(objectURL);
      }
    };
  }, [objectURL]);

  return <img src={objectURL} {...restProps} />;
}
