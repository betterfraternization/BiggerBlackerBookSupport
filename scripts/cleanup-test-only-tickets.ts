const { env } = process;

type IssueNode = {
  id: string;
  number: number;
  title: string;
};

type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

type IssuesResponse = {
  repository: {
    issues: {
      nodes: IssueNode[];
      pageInfo: PageInfo;
    };
  };
};

const API_URL = env.GITHUB_API_URL || "https://api.github.com";
const GRAPHQL_URL = `${API_URL.replace(/\/$/, "")}/graphql`;

const TOKEN = env.SUPPORT_API_TOKEN;
const REPOSITORY = env.GITHUB_REPOSITORY;

if (!TOKEN) {
  console.error("Missing SUPPORT_API_TOKEN in environment.");
  process.exit(1);
}

if (!REPOSITORY) {
  console.error("Missing GITHUB_REPOSITORY in environment.");
  process.exit(1);
}

const [owner, name] = REPOSITORY.split("/");

if (!owner || !name) {
  console.error(`Invalid GITHUB_REPOSITORY value: ${REPOSITORY}`);
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  Authorization: `bearer ${TOKEN}`,
};

async function graphqlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    data: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }

  return payload.data;
}

async function listTestOnlyTickets(): Promise<IssueNode[]> {
  const issues: IssueNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  const query = `
    query ($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        issues(first: 100, after: $cursor, labels: ["test-only"], states: [OPEN, CLOSED]) {
          nodes {
            id
            number
            title
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const data = await graphqlRequest<IssuesResponse>(query, { owner, name, cursor });
    const page = data.repository.issues;
    issues.push(...page.nodes);
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return issues;
}

async function deleteTicket(issueId: string): Promise<void> {
  const mutation = `
    mutation ($issueId: ID!) {
      deleteIssue(input: {issueId: $issueId}) {
        clientMutationId
      }
    }
  `;

  await graphqlRequest(mutation, { issueId });
}

async function run(): Promise<void> {
  const tickets = await listTestOnlyTickets();

  if (tickets.length === 0) {
    console.log("No test-only tickets found.");
    return;
  }

  let deleted = 0;
  for (const ticket of tickets) {
    await deleteTicket(ticket.id);
    deleted += 1;
    console.log(`Deleted #${ticket.number}: ${ticket.title}`);
  }

  console.log(`Deleted ${deleted} test-only ticket(s).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
