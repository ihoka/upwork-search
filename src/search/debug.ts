/**
 * Bisect harness for isolating 500s from `marketplaceJobPostingsSearch`.
 *
 * The full query (all features enabled) is known to fail. The minimal base
 * query (no features) is presumed to work. Between them sits a set of
 * independent "features" (filter inputs + subselection bits). We bisect over
 * the feature set to find the minimal subset that reproduces the failure.
 *
 * Algorithm (classic delta-debugging bisect):
 *   run(enabled): if works → culprit is NOT entirely in `enabled`
 *                 if fails → recurse into `enabled`
 *   Halve `enabled`; try each half; if neither half alone fails, the cause
 *   is a combination that spans both halves — report the current set.
 *
 * Usage: `bun run search:debug`
 */
import { getConfig } from "../config.ts";
import { TokenManager } from "../auth/oauth.ts";

type VariableMutator = (vars: Record<string, unknown>) => void;

interface Feature {
  id: string;
  description: string;
  // Each feature either adds something to variables, or replaces the
  // node-fields selection. `nodeFields`, if set, overrides the default
  // minimal selection (only one feature should set it).
  applyVars?: VariableMutator;
  nodeFields?: string;
}

const MINIMAL_NODE_FIELDS = `id ciphertext title`;
const MONEY_FIELDS = `rawValue currency displayValue`;
const FULL_NODE_FIELDS = `
  id
  ciphertext
  title
  description
  publishedDateTime
  experienceLevel
  duration
  engagement
  amount { ${MONEY_FIELDS} }
  hourlyBudgetMin { ${MONEY_FIELDS} }
  hourlyBudgetMax { ${MONEY_FIELDS} }
  skills { name prettyName }
  client {
    totalHires
    totalReviews
    totalSpent { ${MONEY_FIELDS} }
    location { country }
  }
  occupations {
    category { id prefLabel }
  }
`;

const FEATURES: Feature[] = [
  {
    id: "sortAttributes",
    description: "sortAttributes: [{ field: RECENCY }]",
    applyVars: (v) => {
      v.sortAttributes = [{ field: "RECENCY" }];
    },
  },
  {
    id: "experienceLevel",
    description: "filter.experienceLevel_eq: EXPERT",
    applyVars: (v) => {
      const f = v.marketPlaceJobFilter as Record<string, unknown>;
      f.experienceLevel_eq = "EXPERT";
    },
  },
  {
    id: "clientHiresRange",
    description: "filter.clientHiresRange_eq: { rangeStart: 1 }",
    applyVars: (v) => {
      const f = v.marketPlaceJobFilter as Record<string, unknown>;
      f.clientHiresRange_eq = { rangeStart: 1 };
    },
  },
  {
    id: "pagination50",
    description: "filter.pagination_eq.first: 50 (vs default 10)",
    applyVars: (v) => {
      const f = v.marketPlaceJobFilter as Record<string, unknown>;
      f.pagination_eq = { first: 50 };
    },
  },
  {
    id: "fullSelection",
    description: "full node subselection (Money, skills, client, occupations)",
    nodeFields: FULL_NODE_FIELDS,
  },
];

function buildQuery(nodeFields: string): string {
  return `
    query debugSearch(
      $marketPlaceJobFilter: MarketplaceJobPostingsSearchFilter,
      $searchType: MarketplaceJobPostingSearchType,
      $sortAttributes: [MarketplaceJobPostingSearchSortAttribute]
    ) {
      marketplaceJobPostingsSearch(
        marketPlaceJobFilter: $marketPlaceJobFilter,
        searchType: $searchType,
        sortAttributes: $sortAttributes
      ) {
        totalCount
        edges { node { ${nodeFields} } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
}

function buildRequest(enabled: Feature[]): { query: string; variables: Record<string, unknown> } {
  const variables: Record<string, unknown> = {
    marketPlaceJobFilter: {
      searchExpression_eq: "React",
      pagination_eq: { first: 10 },
    },
    searchType: "USER_JOBS_SEARCH",
  };

  let nodeFields = MINIMAL_NODE_FIELDS;
  for (const feature of enabled) {
    feature.applyVars?.(variables);
    if (feature.nodeFields) nodeFields = feature.nodeFields;
  }

  return { query: buildQuery(nodeFields), variables };
}

function formatErrors(errors: Array<Record<string, unknown>>): string {
  return errors
    .map((e) => {
      const parts: string[] = [String(e.message ?? "(no message)")];
      if (Array.isArray(e.path) && e.path.length) parts.push(`path=${e.path.join(".")}`);
      if (Array.isArray(e.locations) && e.locations.length) {
        parts.push(`locations=${JSON.stringify(e.locations)}`);
      }
      if (e.extensions) parts.push(`extensions=${JSON.stringify(e.extensions)}`);
      return `    - ${parts.join(" ")}`;
    })
    .join("\n");
}

interface ProbeResult {
  ok: boolean;
  detail: string;
}

async function probe(
  apiUrl: string,
  accessToken: string,
  enabled: Feature[],
  tenantId?: string,
): Promise<ProbeResult> {
  const { query, variables } = buildRequest(enabled);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (tenantId) headers["X-Upwork-API-TenantId"] = tenantId;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, detail: `HTTP ${response.status}: ${text.slice(0, 400)}` };
  }

  const json = (await response.json()) as {
    errors?: Array<Record<string, unknown>>;
    data?: { marketplaceJobPostingsSearch?: { totalCount: number } };
  };

  if (json.errors?.length) {
    return { ok: false, detail: `GraphQL errors:\n${formatErrors(json.errors)}` };
  }

  const totalCount = json.data?.marketplaceJobPostingsSearch?.totalCount;
  return { ok: true, detail: `totalCount=${totalCount ?? "?"}` };
}

function label(features: Feature[]): string {
  if (!features.length) return "(none)";
  return features.map((f) => f.id).join(", ");
}

async function fetchTenantId(apiUrl: string, accessToken: string): Promise<string | null> {
  // The Upwork GraphQL API requires `X-Upwork-API-TenantId` on most queries.
  // The `organization` root field returns the authenticated user's org, whose
  // `id` doubles as the tenant id.
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: `query { organization { id name } }` }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`  tenant lookup HTTP ${response.status}: ${text.slice(0, 300)}`);
    return null;
  }
  const json = (await response.json()) as {
    data?: { organization?: { id?: string; name?: string } };
    errors?: Array<Record<string, unknown>>;
  };
  if (json.errors?.length) {
    console.error(`  tenant lookup GraphQL errors:\n${formatErrors(json.errors)}`);
    return null;
  }
  const id = json.data?.organization?.id;
  if (id) console.log(`  organization.id = ${id} (name=${json.data?.organization?.name ?? "?"})`);
  return id ?? null;
}

async function main() {
  const config = getConfig();
  const tokenManager = new TokenManager(config.tokensPath, config.clientId, config.clientSecret);
  const accessToken = await tokenManager.getValidToken();

  console.log(`Target: ${config.apiBaseUrl}`);
  console.log(`Features under bisect (${FEATURES.length}): ${label(FEATURES)}\n`);

  console.log("Fetching X-Upwork-API-TenantId via { organization { id } }...");
  const tenantId = await fetchTenantId(config.apiBaseUrl, accessToken);
  if (tenantId) {
    console.log("  will send X-Upwork-API-TenantId on all subsequent probes.\n");
  } else {
    console.log("  (no tenant id resolved — probing without the header)\n");
  }

  const probeWithTenant = (features: Feature[], tid: string | undefined = tenantId ?? undefined) =>
    probe(config.apiBaseUrl, accessToken, features, tid);

  // Before bisecting features, try several baseline variants. If even the
  // smallest query fails, no amount of feature-bisecting will help — we need
  // to find SOME shape that works first.
  // Introspect the filter input type too — reveals any NON_NULL fields that
  // must be co-supplied with pagination_eq.
  console.log("Introspecting MarketplaceJobPostingsSearchFilter input type...");
  const filterIntroResp = await fetch(config.apiBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(tenantId ? { "X-Upwork-API-TenantId": tenantId } : {}),
    },
    body: JSON.stringify({
      query: `query { __type(name: "MarketplaceJobPostingsSearchFilter") { name inputFields { name type { kind name ofType { kind name } } } } }`,
    }),
  });
  const filterIntroJson = (await filterIntroResp.json()) as {
    data?: { __type?: { inputFields?: Array<{ name: string; type: { kind: string; name: string | null; ofType?: { kind: string; name: string | null } } }> | null } | null };
    errors?: Array<Record<string, unknown>>;
  };
  const filterFields = filterIntroJson.data?.__type?.inputFields ?? [];
  const requiredFilterFields = filterFields.filter((f) => f.type.kind === "NON_NULL");
  console.log(`  ${filterFields.length} input fields, ${requiredFilterFields.length} required (NON_NULL):`);
  for (const f of requiredFilterFields) {
    console.log(`    ! ${f.name}: ${f.type.ofType?.name ?? f.type.ofType?.kind}`);
  }
  if (!requiredFilterFields.length) console.log("    (none are required)");
  console.log("");

  // Introspect the Pagination input type — definitive answer for its shape.
  console.log("Introspecting Pagination input type...");
  const introspectionResponse = await fetch(config.apiBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(tenantId ? { "X-Upwork-API-TenantId": tenantId } : {}),
    },
    body: JSON.stringify({
      query: `query { __type(name: "Pagination") { name inputFields { name type { kind name ofType { kind name } } } } }`,
    }),
  });
  const introJson = (await introspectionResponse.json()) as {
    data?: {
      __type?: {
        name: string;
        inputFields: Array<{
          name: string;
          type: { kind: string; name: string | null; ofType?: { kind: string; name: string | null } };
        }> | null;
      } | null;
    };
    errors?: Array<Record<string, unknown>>;
  };
  console.log(`  raw introspection response: ${JSON.stringify(introJson).slice(0, 600)}`);
  if (introJson.errors?.length) {
    console.log(`  introspection errors:\n    ${formatErrors(introJson.errors).split("\n").join("\n    ")}`);
  } else if (!introJson.data?.__type) {
    console.log("  (no Pagination type found — introspection may be disabled or the name differs)");
  } else {
    const fields = introJson.data.__type.inputFields ?? [];
    console.log(`  Pagination input fields:`);
    for (const f of fields) {
      const t = f.type;
      const typeStr =
        t.kind === "NON_NULL"
          ? `${t.ofType?.name ?? t.ofType?.kind}!`
          : (t.name ?? t.kind);
      console.log(`    - ${f.name}: ${typeStr}`);
    }
  }
  console.log("");

  console.log("Probing baseline variants:\n");
  const variants: Array<{ name: string; query: string; variables: Record<string, unknown> }> = [
    {
      name: "V1. totalCount only (no edges subselection, no searchType/sortAttributes)",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: {
        f: { searchExpression_eq: "React", pagination_eq: { first: 10 } },
      },
    },
    {
      name: "V2. totalCount only, with searchType: USER_JOBS_SEARCH",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter, $t: MarketplaceJobPostingSearchType) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f, searchType: $t) { totalCount }
        }
      `,
      variables: {
        f: { searchExpression_eq: "React", pagination_eq: { first: 10 } },
        t: "USER_JOBS_SEARCH",
      },
    },
    {
      name: "V3. totalCount + edges.node.id only",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter, $t: MarketplaceJobPostingSearchType) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f, searchType: $t) {
            totalCount
            edges { node { id } }
          }
        }
      `,
      variables: {
        f: { searchExpression_eq: "React", pagination_eq: { first: 10 } },
        t: "USER_JOBS_SEARCH",
      },
    },
    {
      name: "V4. Canonical Upwork example (searchExpression only, no pagination)",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter, $t: MarketplaceJobPostingSearchType) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f, searchType: $t) {
            totalCount
          }
        }
      `,
      variables: {
        f: { searchExpression_eq: "React" },
        t: "USER_JOBS_SEARCH",
      },
    },
    // V1-V3 failed only once pagination_eq was added. Try common Pagination
    // shapes to find the one Upwork actually accepts.
    {
      name: "V5. pagination_eq: { first: 10, after: \"\" }",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { first: 10, after: "" } } },
    },
    {
      name: "V6. pagination_eq: { offset: 0, first: 10 }",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { offset: 0, first: 10 } } },
    },
    {
      name: "V7. pagination_eq: { offset: 0, limit: 10 }",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { offset: 0, limit: 10 } } },
    },
    {
      name: "V8. pagination_eq: { page: 1, pageSize: 10 }",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { page: 1, pageSize: 10 } } },
    },
    {
      name: "V9. pagination_eq: { first: 10, last: null }",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: {
        f: { searchExpression_eq: "React", pagination_eq: { first: 10, last: null } },
      },
    },
    {
      name: "V10. pagination_eq: {} (empty object)",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: {} } },
    },
    {
      name: "V11. pagination_eq: { after: null }",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { after: null } } },
    },
    {
      name: "V12. pagination_eq: { first: 1 } (minimum)",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { first: 1 } } },
    },
    {
      name: "V13. pagination_eq: { first: 10 } WITH searchType + sortAttributes",
      query: `
        query(
          $f: MarketplaceJobPostingsSearchFilter,
          $t: MarketplaceJobPostingSearchType,
          $s: [MarketplaceJobPostingSearchSortAttribute]
        ) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f, searchType: $t, sortAttributes: $s) {
            totalCount
          }
        }
      `,
      variables: {
        f: { searchExpression_eq: "React", pagination_eq: { first: 10 } },
        t: "USER_JOBS_SEARCH",
        s: [{ field: "RECENCY" }],
      },
    },
    {
      name: "V14. NO searchExpression, only pagination_eq: { first: 10 }",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) { totalCount }
        }
      `,
      variables: { f: { pagination_eq: { first: 10 } } },
    },
    {
      name: "V15. pagination as literal argument (not via variable)",
      query: `
        query {
          marketplaceJobPostingsSearch(
            marketPlaceJobFilter: { searchExpression_eq: "React", pagination_eq: { first: 10 } }
          ) { totalCount }
        }
      `,
      variables: {},
    },
    {
      name: "V16. select edges+pageInfo with pagination",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) {
            edges { node { id } }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { first: 10 } } },
    },
    {
      name: "V17. select ONLY edges (no totalCount, no pageInfo)",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) {
            edges { node { id } }
          }
        }
      `,
      variables: { f: { searchExpression_eq: "React", pagination_eq: { first: 10 } } },
    },
    {
      name: "V18. NO pagination_eq, WITH edges+pageInfo (does server return a default page?)",
      query: `
        query($f: MarketplaceJobPostingsSearchFilter) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f) {
            totalCount
            edges { node { id ciphertext title } }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      variables: { f: { searchExpression_eq: "React" } },
    },
    {
      name: "V19. Production-style query minus pagination_eq (sort+filters+full subselection)",
      query: `
        query(
          $f: MarketplaceJobPostingsSearchFilter,
          $t: MarketplaceJobPostingSearchType,
          $s: [MarketplaceJobPostingSearchSortAttribute]
        ) {
          marketplaceJobPostingsSearch(marketPlaceJobFilter: $f, searchType: $t, sortAttributes: $s) {
            totalCount
            edges {
              node {
                id ciphertext title publishedDateTime
                experienceLevel duration engagement
                amount { rawValue currency displayValue }
                hourlyBudgetMin { rawValue currency displayValue }
                hourlyBudgetMax { rawValue currency displayValue }
                skills { name prettyName }
                client {
                  totalHires totalReviews
                  totalSpent { rawValue currency displayValue }
                  location { country }
                }
                occupations { category { id prefLabel } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      variables: {
        f: {
          searchExpression_eq: "React",
          experienceLevel_eq: "EXPERT",
          clientHiresRange_eq: { rangeStart: 1 },
        },
        t: "USER_JOBS_SEARCH",
        s: [{ field: "RECENCY" }],
      },
    },
  ];

  let firstWorkingVariant: string | null = null;
  for (const v of variants) {
    process.stdout.write(`  ${v.name} ... `);
    const response = await fetch(config.apiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(tenantId ? { "X-Upwork-API-TenantId": tenantId } : {}),
      },
      body: JSON.stringify({ query: v.query, variables: v.variables }),
    });
    const json = (await response.json()) as {
      errors?: Array<Record<string, unknown>>;
      data?: {
        marketplaceJobPostingsSearch?: {
          totalCount?: number;
          edges?: unknown[];
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        };
      };
    };
    if (json.errors?.length) {
      console.log("✗");
      console.log(`    ${formatErrors(json.errors).split("\n").join("\n    ")}`);
    } else {
      const result = json.data?.marketplaceJobPostingsSearch;
      const tc = result?.totalCount;
      const edgeCount = Array.isArray(result?.edges) ? result.edges.length : "n/a";
      const hasNext = result?.pageInfo?.hasNextPage;
      console.log(
        `✓ totalCount=${tc ?? "?"} edges=${edgeCount}${hasNext !== undefined ? ` hasNextPage=${hasNext}` : ""}`,
      );
      if (!firstWorkingVariant) firstWorkingVariant = v.name;
    }
  }

  if (!firstWorkingVariant) {
    console.log(
      "\nEvery variant failed. The resolver itself is unreachable for this account/token.\n" +
        "Most likely causes:\n" +
        "  - Missing scope: 'Read marketplace Job Postings' on the API key at\n" +
        "    https://www.upwork.com/developer/keys/ . Re-run `bun run setup` after\n" +
        "    enabling the scope (previous tokens become invalid).\n" +
        "  - The access token was issued before the scope was enabled.\n" +
        "  - The tenant id is wrong (the `organization { id }` query returned the\n" +
        "    user org, but the job search may need a different context).",
    );
    process.exit(1);
  }

  console.log(`\nFirst working variant: ${firstWorkingVariant}\n`);

  // Sanity: baseline (our current debug scaffold) should pass.
  process.stdout.write("Baseline (no features)... ");
  const baseline = await probeWithTenant([], tenantId ?? undefined);
  if (!baseline.ok) {
    console.log(`✗\n  ${baseline.detail}`);
    console.log(
      "\nBaseline failed even though a simpler variant worked. The difference between\n" +
        "the working variant and the baseline is the problem — inspect the query shapes above.",
    );
    process.exit(1);
  }
  console.log(`✓ ${baseline.detail}`);

  // Sanity: full set should fail (otherwise there's nothing to bisect).
  process.stdout.write("Full set (all features)... ");
  const full = await probeWithTenant( FEATURES);
  if (full.ok) {
    console.log(`✓ ${full.detail}`);
    console.log("\nFull query passed. Nothing to bisect — the bug may be intermittent.");
    return;
  }
  console.log(`✗\n  ${full.detail}\n`);

  // Bisect. Invariant: `enabled` is known to fail.
  let enabled = [...FEATURES];
  while (enabled.length > 1) {
    const mid = Math.ceil(enabled.length / 2);
    const left = enabled.slice(0, mid);
    const right = enabled.slice(mid);

    console.log(`Bisecting ${enabled.length} features (L=${label(left)} | R=${label(right)})`);

    process.stdout.write(`  try LEFT only (${label(left)})... `);
    const leftResult = await probeWithTenant( left);
    console.log(leftResult.ok ? `✓ ${leftResult.detail}` : `✗`);
    if (!leftResult.ok) {
      if (!leftResult.detail.startsWith("totalCount")) {
        console.log(`    ${leftResult.detail.split("\n").join("\n    ")}`);
      }
      enabled = left;
      continue;
    }

    process.stdout.write(`  try RIGHT only (${label(right)})... `);
    const rightResult = await probeWithTenant( right);
    console.log(rightResult.ok ? `✓ ${rightResult.detail}` : `✗`);
    if (!rightResult.ok) {
      if (!rightResult.detail.startsWith("totalCount")) {
        console.log(`    ${rightResult.detail.split("\n").join("\n    ")}`);
      }
      enabled = right;
      continue;
    }

    // Neither half alone reproduces — it's an interaction across the split.
    console.log(
      `\nNeither half alone fails; failure requires interaction between ${label(left)} and ${label(right)}.`,
    );
    console.log(`Minimal failing set: ${label(enabled)}`);
    const reshow = await probeWithTenant( enabled);
    console.log(`Reproduction: ${reshow.detail}`);
    return;
  }

  console.log(`\nMinimal failing feature: ${enabled[0].id} — ${enabled[0].description}`);
  const reshow = await probeWithTenant( enabled);
  if (!reshow.ok) console.log(reshow.detail);
}

main().catch((error) => {
  console.error("Debug run failed:", error);
  process.exit(1);
});
