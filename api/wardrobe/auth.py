import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .settings import get_settings


class UnauthorizedException(HTTPException):
    def __init__(self, detail: str, **kwargs):
        super().__init__(status.HTTP_403_FORBIDDEN, detail=detail)


class UnauthenticatedException(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Requires authentication",
        )


async def verify_token(
    token: HTTPAuthorizationCredentials | None = Depends(HTTPBearer()),
):
    settings = get_settings()

    # This gets the JWKS from a given URL and does processing so you can
    # use any of the keys available
    jwks_url = f"https://{settings.AUTH0_DOMAIN}/.well-known/jwks.json"
    jwks_client = jwt.PyJWKClient(jwks_url)

    if token is None:
        raise UnauthenticatedException

    # This gets the 'kid' from the passed token
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(
            token.credentials
        ).key
    except jwt.exceptions.PyJWKClientError as error:
        raise UnauthorizedException(str(error))
    except jwt.exceptions.DecodeError as error:
        raise UnauthorizedException(str(error))

    try:
        payload = jwt.decode(
            token.credentials,
            signing_key,
            algorithms=settings.AUTH0_ALGORITHMS,
            audience=settings.AUTH0_API_AUDIENCE,
            issuer=settings.AUTH0_ISSUER,
        )
    except Exception as error:
        raise UnauthorizedException(str(error))

    return payload
