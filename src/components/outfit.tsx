import { type Wearable } from "@/shared/schemas";
import { useId, useRef, useState, useSyncExternalStore } from "react";

export type OutfitProps = {
  wearables: Wearable[];
  avatarUrl: string;
  /** Called once every image has loaded. */
  onReady?: () => void;
};

/**
 * Renders wearables on an avatar.
 *
 * Wearables are composited on top of the avatar using their mask, so the only the wearable itself
 * is visible.
 * Wearables are composited bottom-up in array order.
 * An outfit is atomic in the sense that we do not render anything until all wearables and their
 * masks are loaded. If any of them fails to load, the error is thrown to the nearest error boundary
 * rather than showing the outfit without it. A wearable without WOA images is also thrown, since
 * only generated wearables can be shown.
 */
export function Outfit({ wearables, avatarUrl, onReady }: OutfitProps) {
  for (const wearable of wearables) {
    if (!wearable.woa_image_url || !wearable.woa_mask_url) {
      throw new Error(`Wearable ${wearable.id} has no wear-on-avatar image`);
    }
  }
  // Hidden until every part has loaded, but still mounted so the images can load.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // The avatar, plus one per layer.
  const remaining = useRef(1 + wearables.length);
  if (error) throw error;
  function onLoaded() {
    if (--remaining.current === 0) {
      setReady(true);
      onReady?.();
    }
  }
  function onLoadError(url: string) {
    setError(new Error(`Failed to load ${url}`));
  }
  return (
    <div className="absolute inset-0" style={{ visibility: ready ? "visible" : "hidden" }}>
      {/*
       * The avatar is only shown while an outfit is selected: without one it may still
       * be wearing the arbitrary clothes from the source photo, which would be
       * confusing in the outfit builder.
       */}
      <img
        src={avatarUrl}
        onLoad={onLoaded}
        onError={() => onLoadError(avatarUrl)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {wearables.map((wearable) => (
        <WearableLayer
          key={wearable.id}
          wearable={wearable}
          onLoad={onLoaded}
          onError={onLoadError}
        />
      ))}
    </div>
  );
}

/**
 * Renders a wearable's WOA image with its WOA image mask applied. Calls `onLoad` once both have
 * loaded, and `onError` with the URL of whichever one fails.
 */
function WearableLayer({
  wearable,
  onLoad,
  onError,
}: {
  wearable: Wearable;
  onLoad: () => void;
  onError: (url: string) => void;
}) {
  // The cutout is an SVG image under an SVG mask rather than a CSS mask-image over an <img>. A CSS
  // mask fetches its image through its own invisible request, which neither shares the layer
  // image's load nor reports when it has applied. The SVG mask is part of this element's tree, so
  // each image is requested once and both settle through load events.
  const maskId = useId();
  // Both the image and the mask must load before the layer counts as loaded.
  const remaining = useRef(2);
  function onPartLoad() {
    if (--remaining.current === 0) onLoad();
  }
  return (
    <svg className="absolute inset-0 h-full w-full">
      <defs>
        {/*
         * Both images fill the layer box with cover semantics (slice), so the mask stays over its
         * own pixels whatever the aspect, exactly like object-cover does for the image.
         */}
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          style={{ maskType: "luminance" }}
        >
          <image
            href={wearable.woa_mask_url!}
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            onLoad={onPartLoad}
            onError={() => onError(wearable.woa_mask_url!)}
          />
        </mask>
      </defs>
      <image
        href={wearable.woa_image_url!}
        x="0"
        y="0"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        mask={`url(#${maskId})`}
        onLoad={onPartLoad}
        onError={() => onError(wearable.woa_image_url!)}
      />
    </svg>
  );
}

/**
 * Renders wearables on an avatar and, if wearables change, keeps rendering the previous wearables
 * until all new wearables are loaded.
 */
export function OutfitTransition({
  wearables,
  avatarUrl,
}: {
  wearables: Wearable[];
  avatarUrl: string;
}) {
  const incoming: OutfitProps = { avatarUrl, wearables };
  // `current` is the outfit being loaded or shown. `previous` is the outfit it replaces, which stays
  // on screen underneath until `current` has loaded.
  const [current, setCurrent] = useState<OutfitProps>(incoming);
  const [previous, setPrevious] = useState<OutfitProps | null>(null);
  const [ready, setReady] = useState(false);
  // The outfit's images are only mounted in the browser: an image that finishes loading before
  // hydration never fires the load event React listens for, so it would never count as loaded.
  const isClient = useIsClient();

  if (outfitKey(incoming) !== outfitKey(current)) {
    // Only a fully shown outfit replaces the one under it. Otherwise the previous one stays on screen
    // while the new current one loads.
    setPrevious(ready ? current : previous);
    setCurrent(incoming);
    setReady(false);
  }

  return (
    <div className="relative h-full w-full">
      {!previous && !ready && (
        // Nothing has loaded yet: hold the layout space with a muted block.
        <div className="h-full w-full bg-muted" role="status" aria-label="Loading preview" />
      )}
      {previous && (
        <Outfit
          key={outfitKey(previous)}
          avatarUrl={previous.avatarUrl}
          wearables={previous.wearables}
        />
      )}
      {isClient && (
        <Outfit
          key={outfitKey(current)}
          avatarUrl={current.avatarUrl}
          wearables={current.wearables}
          onReady={() => {
            setReady(true);
            setPrevious(null);
          }}
        />
      )}
    </div>
  );
}

/** False while the page is server-rendered and hydrating, true in the browser. */
function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** The outfit's URLs joined, so an outfit can be told apart from another with the same wearables. */
function outfitKey({ avatarUrl, wearables }: OutfitProps) {
  return [
    avatarUrl,
    ...wearables.flatMap((wearable) => [wearable.woa_image_url, wearable.woa_mask_url]),
  ].join("|");
}
