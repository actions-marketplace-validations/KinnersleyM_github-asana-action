const core = require("@actions/core");
const github = require("@actions/github");
const asana = require("asana");

const initAsana = ({ asanaToken }) => {
  return asana.Client.create().useAccessToken(asanaToken);
};
const initOctokit = ({ githubToken }) => {
  return github.getOctokit(githubToken);
};

const getAsanaTask = async ({ gid, client }) => {
  const task = await client.tasks.getTask(gid);
  if (!task) {
    throw new Error(`Task not found with gid: ${gid}`);
  }
  return task;
};

const getAsanaTaskUrl = async ({ gid, client }) => {
  const { permalink_url } = await getAsanaTask({ gid, client });
  if (!permalink_url) {
    throw new Error(`Task URL not found for gid: ${gid}`);
  }
  return permalink_url;
};

const addPRToAsanaTask = async ({ gid, prUrl, client }) => {
  const comment = `GitHub PR: ${prUrl}`;
  return await client.stories.createStoryForTask(gid, { text: comment });
};

const commentOnIssue = async ({
  asanaTaskUrl,
  owner,
  repo,
  issue_number,
  client,
}) => {
  const comment = `Asana Task: ${asanaTaskUrl}`;
  return await client.issues.createComment({
    owner,
    repo,
    issue_number,
    body: comment,
  });
};

const getAsanaTaskGid = ({ ref }) => {
  const lastSlashIndex = ref.lastIndexOf("/");
  if (lastSlashIndex == -1) {
    throw new Error(`Could not find slash in ref: ${ref}`);
  }
  return ref.substring(lastSlashIndex + 1);
};

const getGithubDetails = ({
  context: {
    payload: {
      pull_request: {
        head: { ref },
        html_url: prUrl,
        number: issue_number,
      },
      repository: { full_name },
    },
  },
}) => {
  console.log(ref, prUrl, issue_number, full_name);
  validateGithubDetails([
    { name: "pr ref", value: ref },
    { name: "pr url", value: prUrl },
    { name: "issue number", value: issue_number },
    { name: "repo name", value: full_name },
  ]);
  return { ref, prUrl, issue_number, full_name };
};

const validateGithubDetails = (properties) => {
  const undefinedProperties = [];
  properties.forEach((property) => {
    if (!property.value) {
      undefinedProperties.push(property.name);
    }
  });
  if (undefinedProperties.length > 0) {
    throw new Error(
      `Cannot find the following properties: ${undefinedProperties.join(", ")}`
    );
  }
};

const run = async () => {
  try {
    const asanaToken = core.getInput("asana-token");
    const githubToken = core.getInput("github-token");

    const asanaClient = initAsana({ asanaToken });
    const octoKitClient = initOctokit({ githubToken });

    const { ref, prUrl, issue_number, full_name } = getGithubDetails(github);

    const [owner, repo] = full_name.split("/");

    const gid = getAsanaTaskGid({ ref });

    await addPRToAsanaTask({
      gid,
      prUrl,
      client: asanaClient,
    });

    const asanaTaskUrl = await getAsanaTaskUrl({ gid, client: asanaClient });

    await commentOnIssue({
      asanaTaskUrl,
      owner,
      repo,
      issue_number,
      client: octoKitClient,
    });

    core.setOutput("pr_url", prUrl);
    core.setOutput("asana_task_url", asanaTaskUrl);
  } catch (error) {
    core.setFailed(error.message);
  }
};

run();

module.exports = { getAsanaTaskGid, getGithubDetails, getAsanaTask };
