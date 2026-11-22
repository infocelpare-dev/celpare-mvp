"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GoogleButton } from "./google-button";
import { returnPath, withNext } from "@/lib/auth/return-to";

/*
  `?next=` read in the browser, for the sign in pages that are prebuilt.

  /signup and /get-started are served from the cache to signed out visitors
  (Workers free plan, 10 ms of CPU a request). Reading searchParams on the
  server would make them render on every request and bring back error 1102,
  so these pages stay static and the address is read after the page loads.
  Before that the links simply point at the plain form, which still works.
*/
export function useReturnTo(): string | undefined {
  const [next, setNext] = useState<string | undefined>(undefined);
  useEffect(() => {
    /* Read once after mount: the server render has no address to read. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNext(returnPath(new URLSearchParams(window.location.search).get("next")) ?? undefined);
  }, []);
  return next;
}

export function GoogleButtonHere({ label }: { label: string }) {
  return <GoogleButton label={label} next={useReturnTo()} />;
}

export function LinkHere({
  href,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  return <Link href={withNext(href, useReturnTo())} {...props} />;
}
