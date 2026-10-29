import { permanentRedirect } from "next/navigation";

/* The short address other services link to; the page lives at /legal/privacy. */
export default function Page() {
  permanentRedirect("/legal/privacy");
}
