import { AdminSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <AdminSkeleton tiles={4} rows={8} table={true} />;
}
