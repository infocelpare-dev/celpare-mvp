import { AdminSkeleton } from "@/components/admin/skeleton";

export default function Loading() {
  return <AdminSkeleton tiles={0} rows={5} table={true} />;
}
