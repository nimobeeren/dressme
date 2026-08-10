"use client";

import { useEffect } from "react";

/**
 * Shows a one-time alert in production builds warning that this is an alpha.
 */
export function AlphaNotice() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      const storageKey = "alpha_notice_shown";
      const hasShown = sessionStorage.getItem(storageKey) === "true";
      if (!hasShown) {
        alert(
          "This is an alpha version of dressme. Expect your data to vanish with no notice. Have fun!",
        );
        sessionStorage.setItem(storageKey, "true");
      }
    }
  }, []);

  return null;
}
