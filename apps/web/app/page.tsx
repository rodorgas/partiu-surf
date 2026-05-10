// Root route — redirects to the default spot. Phase 5 will swap this for a
// geolocation-aware picker; for now the design's headline spot is fine.

import { redirect } from "next/navigation";
import { DEFAULT_SPOT_SLUG } from "@/lib/spots";

export default function Page() {
  redirect(`/${DEFAULT_SPOT_SLUG}`);
}
