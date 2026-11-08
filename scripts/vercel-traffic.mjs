/*
  Point Vercel production traffic at a deployment (D253).

    node scripts/vercel-traffic.mjs promote  <deployment-url>
    node scripts/vercel-traffic.mjs rollback <deployment-url>

  Used by deploy.yml and rollback.yml instead of `vercel promote` and
  `vercel rollback`. Those CLI commands look up the personal account behind
  the token first, and a token scoped to the devsclpr team gets
  "User not found. (404)" there (Deploy run 42511514055). The REST endpoints
  take the team explicitly:

    GET  /v13/deployments/{host}                     the deployment id
    POST /v10/projects/{project}/promote/{id}        promote
    POST /v1/projects/{project}/rollback/{id}        rollback (Hobby: only to
                                                     the previous production
                                                     deployment)

  Then it waits up to 60 s for the project's production target to be that
  deployment, so "done" means Vercel says so, not just that it accepted.

  Needs VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID. Refuses a deployment of
  another project. Prints ids and API error messages only, never the token.
  No dependencies. Exit 1 on any failure.
*/

const [action, url] = process.argv.slice(2);
const { VERCEL_TOKEN: token, VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: project } = process.env;

function die(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!["promote", "rollback"].includes(action) || !/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/.test(url ?? "")) {
  die("Usage: node scripts/vercel-traffic.mjs <promote|rollback> https://<deployment>.vercel.app");
}
if (!token || !team || !project) die("VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID must be set.");

async function api(method, path) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.vercel.com${path}${sep}teamId=${encodeURIComponent(team)}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* empty or non JSON answer: keep {} */
  }
  if (!res.ok) die(`${method} ${path.split("?")[0]} answered ${res.status}: ${body?.error?.message ?? "no message"}`);
  return body;
}

const host = new URL(url).host;
const dep = await api("GET", `/v13/deployments/${host}`);
if (dep.projectId !== project) die(`${host} belongs to another project.`);
const id = dep.id;
console.log(`${action}: ${host} is ${id} (${dep.target ?? "no target"}, ${dep.readyState ?? "unknown state"})`);

const path =
  action === "promote" ? `/v10/projects/${project}/promote/${id}` : `/v1/projects/${project}/rollback/${id}`;
await api("POST", path);

for (let i = 0; i < 12; i++) {
  const p = await api("GET", `/v9/projects/${project}`);
  const live = p?.targets?.production?.id;
  if (live === id) {
    console.log(`${action}: production now serves ${id}.`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
die(`${action} was accepted but production does not serve ${id} after 60 s.`);
