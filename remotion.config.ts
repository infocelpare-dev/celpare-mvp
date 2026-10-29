import { Config } from "@remotion/cli/config";

/* The films read their own assets (tool logos, the mark, generated audio) from
   video/public, so none of it ships with the site's public/. */
Config.setPublicDir("video/public");
