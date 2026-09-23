import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";
import { CompareSkeleton } from "@/components/compare/skeleton";

/*
  The loading state for Compare. Inside AppShellSkeleton, because a fallback
  replaces the page and the page is what renders the app frame (4AS.17): without
  it the document scrolls into a black void while the comparison loads.
*/
export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="mx-auto w-full max-w-[1140px] px-4 py-6 sm:px-6 sm:py-8">
        <CompareSkeleton />
        <p role="status" className="sr-only">
          Loading the comparison
        </p>
      </div>
    </AppShellSkeleton>
  );
}
