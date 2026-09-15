import { AdminSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <AdminSkeleton tiles={0} rows={6} table={false} />;
}
