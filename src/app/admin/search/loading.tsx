import { AdminSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <AdminSkeleton tiles={6} rows={0} table={false} />;
}
