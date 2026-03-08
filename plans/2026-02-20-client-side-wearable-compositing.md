# Client-side wearable compositing (full feature)

## Context

The outfit preview currently composites images server-side on every request (`GET /images/outfit` → PIL), requiring the `AuthenticatedImage` component to attach Bearer tokens. Moving compositing to the client via CSS `mask-image` + `mask-mode: luminance` enables instant outfit switching, and since the WOA/mask images can be served as pre-signed URLs (same as wearable images already are), we can delete `AuthenticatedImage` entirely and simplify significantly.

## What gets deleted

- `api/src/dressme/combining.py` — entire file
- `GET /images/outfit` endpoint in `main.py` (lines 390–481) + its `combine_wearables` import
- `src/components/authenticated-image.tsx` — entire file
- `AuthenticatedImage` import and usage in `home.tsx`

## Backend changes (`api/src/dressme/main.py`)

### 1. Extend the `Wearable` response model

```python
class Wearable(BaseModel):
    id: UUID
    category: str
    description: str | None
    wearable_image_url: str
    generation_status: Literal["pending", "completed"]
    woa_image_url: str | None   # new; non-null iff generation_status == "completed"
    woa_mask_url: str | None    # new; non-null iff generation_status == "completed"
```

### 2. Extend `GET /wearables` query to fetch WOA keys

The existing subquery already joins WOA; extend the `select()` to also pull `image_key` and `mask_image_key` columns, then generate signed URLs for them.

Invariant: `WearableOnAvatarImage.image_key` and `mask_image_key` are non-nullable in the DB, so if a WOA record exists, both keys are always present. The URL fields are only `None` in the normal "pending" case (no WOA record yet).

Add a defensive error log for the abnormal case: WOA record exists (meaning status would be "completed") but somehow a key is null — degrade to `generation_status: "pending"` and log an error. Normal pending vs. abnormal: the difference is whether a WOA row was found in the join. If the join hits a row but the keys are null, that's data corruption → error.

### 3. Extend the `User` response model + `GET /users/me`

```python
class User(BaseModel):
    id: UUID
    avatar_image_url: str | None   # replaces has_avatar_image; non-null iff user has an avatar
```

`has_avatar_image: bool` is removed — `avatar_image_url is not None` is equivalent and avoids redundancy. `GET /users/me` generates a signed URL from `AVATARS_BUCKET` when `avatar_image_key` is set, otherwise returns `None`. Add a defensive error log if `avatar_image_key` is set but the signed URL can't be generated.

## Frontend changes

### Regenerate API types

After the backend changes, run the codegen script to update `src/api/types.gen.ts` and `src/api/sdk.gen.ts` — check `package.json` for the generate script.

### `src/pages/home.tsx`

Replace:

```tsx
<AuthenticatedImage
  src={`${API}/images/outfit?top_id=${activeTopId}&bottom_id=${activeBottomId}`}
  className="h-full w-full object-cover"
/>
```

With three stacked layers — only rendered when both wearables are selected:

```tsx
{activeTopId && activeBottomId ? (
  <div className="relative h-full w-full">
    {/*
     * The avatar is intentionally only shown when a wearable is selected.
     * Without a wearable, the avatar may be wearing arbitrary clothes from the
     * original photo, which would be confusing in the outfit builder context.
     */}
    {avatarImageUrl && (
      <img src={avatarImageUrl} className="absolute inset-0 h-full w-full object-cover" />
    )}
    {activeBottom?.woa_image_url && activeBottom?.woa_mask_url && (
      <img
        src={activeBottom.woa_image_url}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          WebkitMaskImage: `url(${activeBottom.woa_mask_url})`,
          maskImage: `url(${activeBottom.woa_mask_url})`,
          WebkitMaskMode: "luminance",
          maskMode: "luminance",
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
        }}
      />
    )}
    {activeTop?.woa_image_url && activeTop?.woa_mask_url && (
      <img ... /> {/* same pattern, top layer */}
    )}
  </div>
) : (
  <div className="flex h-full items-center justify-center px-8">
    <p className="text-center">Select a top and bottom to see your outfit preview.</p>
  </div>
)}
```

`avatarImageUrl` comes from the `useMe()` hook response. `activeTop`/`activeBottom` are the `Wearable` objects (already fetched).

## Avatar change consistency

The old `GET /images/outfit` filtered WOA records by `avatar_image_key == current_user.avatar_image_key`, returning a 404 if the avatar had changed. The new `GET /wearables` uses the same filter — a changed avatar means no WOA records match, so `woa_image_url`/`woa_mask_url` come back `null`, and the wearable layers simply don't render. Consistent behaviour (stale WOAs are never used), but graceful degradation instead of an error.

(Note: the API currently blocks avatar replacement entirely, so this is a future-proofing concern.)

## Tests (`api/src/dressme/test_main.py`)

- **Delete** `TestGetOutfitImage` — the endpoint is gone
- **Update** `TestGetMe`: assert that `avatar_image_url` is present (and matches `mock_blob_storage.get_signed_url(...)`) when the user has an avatar; assert `None` when they don't
- **Update** `TestGetWearables`: assert `woa_image_url` and `woa_mask_url` are populated (with mock signed URL pattern) when a WOA record exists for the wearable; assert both are `None` when `generation_status == "pending"`

Run with `pytest` from the `api/` directory.

## Critical files

- `api/src/dressme/main.py` — response models + `get_wearables` + `get_me` + delete `get_outfit_image`
- `api/src/dressme/combining.py` — delete
- `src/components/authenticated-image.tsx` — delete
- `src/pages/home.tsx` — replace outfit section
- `src/api/types.gen.ts` / `src/api/sdk.gen.ts` — regenerate

## Verification

1. Run `pytest` from `api/` — all tests pass
2. Confirm no remaining references to `AuthenticatedImage` or `GET /images/outfit` in the codebase
3. **User verifies the app manually** (last): open the app, select a top + bottom, confirm the composited outfit renders correctly via CSS layers with instant switching between wearables
