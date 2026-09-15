import { getNotices } from "@/lib/account/notice";
import { NoticeBar } from "./notice-bar";

/*
  A server component passed into AppShell's `banner` slot. One import and one
  line per page, rather than every page repeating the fetch.

  Renders nothing at all when there is nothing to say, which is the normal case,
  so it costs one settings read and one profile read on pages that already read
  the session.
*/
export async function AccountNotices() {
  const notices = await getNotices();
  return <NoticeBar notices={notices} />;
}
